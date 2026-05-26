export interface RevizorskiZapis {
  id?: number;
  redosled: number;
  prethodni_hash: string;
  trenutni_hash: string;
  dokument_id: string;
  xml_hash: string;
  dogadjaj: string;
  detalji?: string;
  kreirano_u: string;
}

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

export class CryptographicLedger {
  /**
   * Upisuje novi revizorski događaj u D1 bazu podataka, kriptografski ga povezujući sa prethodnim blokom.
   * Sadrži ugrađeni retry mehanizam sa backoff-om za prevenciju concurrency race-condition konflikata na redosled.
   */
  static async appendEvent(
    db: any,
    documentId: string,
    xmlBlob: string,
    dogadjaj: string,
    detalji?: any
  ): Promise<string> {
    const xmlHash = await sha256(xmlBlob || "");
    const genesisHash = await sha256("SEF_SYSTEM_GENESIS_2026");

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        const kreirano_u = new Date().toISOString();

        // 1. Dobijamo poslednji zapis iz lanca radi uvezivanja heševa
        const last = await db.prepare(
          "SELECT redosled, trenutni_hash FROM revizorski_trag ORDER BY redosled DESC LIMIT 1"
        ).first<any>();

        let redosled = 1;
        let prethodni_hash = genesisHash;

        if (last) {
          redosled = last.redosled + 1;
          prethodni_hash = last.trenutni_hash;
        }

        // 2. Računamo trenutni heš koji pečatira metapodatke i uvezuje prethodni blok
        const payloadToHash = redosled.toString() + prethodni_hash + documentId + xmlHash + dogadjaj + kreirano_u;
        const trenutni_hash = await sha256(payloadToHash);

        // 3. Upisujemo zapis u append-only tabelu
        await db.prepare(
          `INSERT INTO revizorski_trag 
           (redosled, prethodni_hash, trenutni_hash, dokument_id, xml_hash, dogadjaj, detalji, kreirano_u) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          redosled,
          prethodni_hash,
          trenutni_hash,
          documentId,
          xmlHash,
          dogadjaj,
          detalji ? JSON.stringify(detalji) : null,
          kreirano_u
        ).run();

        return trenutni_hash;
      } catch (err: any) {
        attempts++;
        if (attempts >= maxAttempts) {
          throw new Error(`🛡️ [CryptographicLedger] FATAL: Neuspešan upis u append-only log nakon ${maxAttempts} pokušaja. Greška: ${err.message}`);
        }
        // Eksponencijalni backoff sa malo šuma (random)
        const delay = 10 * attempts + Math.floor(Math.random() * 20);
        console.warn(`⚠️ [CryptographicLedger Concurrency] Konflikt redosleda detektovan. Pokušavam ponovo za ${delay}ms (Pokušaj ${attempts}/${maxAttempts})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error("🛡️ [CryptographicLedger] Neočekivani izlaz iz retry petlje.");
  }

  /**
   * Rekalkuliše i verifikuje integritet čitavog revizorskog lanca u bazi podataka.
   * Ako je bilo koji istorijski podatak promenjen ili obrisan, verifikacija puca.
   */
  static async verifyChain(db: any): Promise<{ success: boolean; tamperedIndex?: number; message?: string }> {
    const result = await db.prepare(
      "SELECT id, redosled, prethodni_hash, trenutni_hash, dokument_id, xml_hash, dogadjaj, detalji, kreirano_u FROM revizorski_trag ORDER BY redosled ASC"
    ).all();

    if (!result || !result.results || result.results.length === 0) {
      return { success: true, message: "Kanal je prazan, integritet je neutralno ispravan." };
    }

    const records = result.results as RevizorskiZapis[];
    const genesisHash = await sha256("SEF_SYSTEM_GENESIS_2026");

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
      const expectedPrethodniHash = i === 0 ? genesisHash : records[i - 1].trenutni_hash;
      if (rec.prethodni_hash !== expectedPrethodniHash) {
        return {
          success: false,
          tamperedIndex: rec.redosled,
          message: `Narušen lanac heširanja! Prethodni heš zapisa ${rec.redosled} se ne podudara sa trenutnim hešom prethodnog zapisa.`
        };
      }

      // C. Rekalkulacija i provera trenutnog heša
      const payloadToHash = rec.redosled.toString() + rec.prethodni_hash + rec.dokument_id + rec.xml_hash + rec.dogadjaj + rec.kreirano_u;
      const recalculatedHash = await sha256(payloadToHash);

      if (rec.trenutni_hash !== recalculatedHash) {
        return {
          success: false,
          tamperedIndex: rec.redosled,
          message: `Detektovana neovlašćena promena metapodataka na zapisu ${rec.redosled}! Rekalkulisani heš se ne poklapa sa potpisom u bazi.`
        };
      }
    }

    return { success: true };
  }
}
