export interface RevizorskiZapis {
  id?: number;
  redosled: number;
  prethodni_hash: string;
  trenutni_hash: string;
  dokument_id: string;
  dogadjaj: string;
  detalji: string;
  kreirano_u: string;
}

const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Edge-native helper za izračunavanje SHA-256 heša koristeći standardni Web Crypto API.
 */
export async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Izračunava HMAC-SHA256 potpis za dati tekst i tajni ključ.
 */
export async function hmac(text: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(text);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Deterministička JSON kanonikalizacija — osigurava da isti objekt uvek proizvodi isti string,
 * bez obzira na redosled ključeva u memoriji.
 */
export function canonicalize(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalize(item)).join(',') + ']';
  }

  const sortedKeys = Object.keys(obj).sort();
  const result = sortedKeys.map(key => {
    return `"${key}":${canonicalize(obj[key])}`;
  });

  return '{' + result.join(',') + '}';
}

export class CryptographicLedger {
  /**
   * Izračunava SHA-256 heš bloka koristeći strogi "Audit Chain" format:
   * redosled:prethodniHash:dokumentId:dogadjaj:canonicalDetails
   */
  public static async calculateHash(
    redosled: number,
    prethodniHash: string,
    dokumentId: string,
    dogadjaj: string,
    detalji: any
  ): Promise<string> {
    const detailsCanonical = canonicalize(detalji);
    const payload = `${redosled}:${prethodniHash}:${dokumentId}:${dogadjaj}:${detailsCanonical}`;
    return await sha256(payload);
  }

  /**
   * Upisuje novi revizorski događaj u D1 bazu podataka, kriptografski ga povezujući sa prethodnim blokom.
   */
  static async appendEvent(
    db: any,
    documentId: string,
    dogadjaj: string,
    detalji?: any
  ): Promise<string> {
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      try {
        // 1. Dobijamo poslednji zapis iz lanca radi uvezivanja heševa
        const last = await db.prepare(
          "SELECT redosled, trenutni_hash FROM revizorski_trag ORDER BY redosled DESC LIMIT 1"
        ).first<any>();

        const redosled = last ? last.redosled + 1 : 1;
        const prethodni_hash = last ? last.trenutni_hash : GENESIS_HASH;

        // 2. Računamo trenutni heš koji pečatira metapodatke i uvezuje prethodni blok
        const trenutni_hash = await this.calculateHash(
          redosled,
          prethodni_hash,
          documentId,
          dogadjaj,
          detalji || {}
        );

        const kreirano_u = new Date().toISOString();

        // 3. Upisujemo zapis u append-only tabelu
        await db.prepare(
          `INSERT INTO revizorski_trag 
           (redosled, prethodni_hash, trenutni_hash, dokument_id, dogadjaj, detalji, kreirano_u) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          redosled,
          prethodni_hash,
          trenutni_hash,
          documentId,
          dogadjaj,
          canonicalize(detalji || {}),
          kreirano_u
        ).run();

        return trenutni_hash;
      } catch (err: any) {
        attempts++;
        if (attempts >= maxAttempts) {
          throw new Error(`🛡️ [CryptographicLedger] FATAL: Neuspešan upis u append-only log nakon ${maxAttempts} pokušaja. Greška: ${err.message}`);
        }
        const delay = 10 * attempts + Math.floor(Math.random() * 20);
        console.warn(`⚠️ [CryptographicLedger Concurrency] Konflikt redosleda detektovan. Pokušavam ponovo za ${delay}ms (Pokušaj ${attempts}/${maxAttempts})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error("🛡️ [CryptographicLedger] Neočekivani izlaz iz retry petlje.");
  }

  /**
   * Rekalkuliše i verifikuje integritet čitavog revizorskog lanca u bazi podataka.
   */
  static async verifyChain(db: any): Promise<{ success: boolean; tamperedIndex?: number; message?: string }> {
    const result = await db.prepare(
      "SELECT redosled, prethodni_hash, trenutni_hash, dokument_id, dogadjaj, detalji, kreirano_u FROM revizorski_trag ORDER BY redosled ASC"
    ).all();

    if (!result || !result.results || result.results.length === 0) {
      return { success: true, message: "Kanal je prazan, integritet je neutralno ispravan." };
    }

    const records = result.results as RevizorskiZapis[];
    let expectedPrethodniHash = GENESIS_HASH;

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];

      // A. Verifikacija poretka
      if (rec.redosled !== i + 1) {
        return {
          success: false,
          tamperedIndex: rec.redosled,
          message: `Narušen redosled u bazi podataka na indeksu ${i + 1}. Detektovano brisanje unosa!`
        };
      }

      // B. Verifikacija prethodnog heša
      if (rec.prethodni_hash !== expectedPrethodniHash) {
        return {
          success: false,
          tamperedIndex: rec.redosled,
          message: `Narušen lanac heširanja! Prethodni heš zapisa ${rec.redosled} se ne podudara sa očekivanim prethodnikom.`
        };
      }

      // C. Rekalkulacija i provera trenutnog heša
      const recalculatedHash = await this.calculateHash(
        rec.redosled,
        rec.prethodni_hash,
        rec.dokument_id,
        rec.dogadjaj,
        JSON.parse(rec.detalji || "{}")
      );

      if (rec.trenutni_hash !== recalculatedHash) {
        return {
          success: false,
          tamperedIndex: rec.redosled,
          message: `Detektovana neovlašćena promena metapodataka na zapisu ${rec.redosled}! Rekalkulisani heš se ne poklapa sa potpisom u bazi.`
        };
      }

      expectedPrethodniHash = rec.trenutni_hash;
    }

    return { success: true };
  }
}


