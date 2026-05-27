import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { CryptographicLedger, sha256 } from '../packages/shared/services/CryptographicLedger';

const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

describe('🔐 Cryptographic Immutable Audit Ledger — Hash-Chained Trust Engine Integration', () => {

  beforeAll(async () => {
    // 1. Inicijalizujemo tabelu i indekse u realnoj D1 testnoj bazi
    await (env as any).REGISTAR_DB.prepare("DROP TABLE IF EXISTS revizorski_trag").run();
    await (env as any).REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS revizorski_trag (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        redosled INTEGER NOT NULL,
        prethodni_hash TEXT NOT NULL,
        trenutni_hash TEXT NOT NULL,
        dokument_id TEXT NOT NULL,
        dogadjaj TEXT NOT NULL,
        detalji TEXT NOT NULL,
        kreirano_u TEXT NOT NULL
      )
    `).run();
    await (env as any).REGISTAR_DB.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_revizorski_red ON revizorski_trag(redosled)
    `).run();
  });

  beforeEach(async () => {
    // Čistimo tabelu pre svakog testa radi izolacije
    await (env as any).REGISTAR_DB.prepare("DELETE FROM revizorski_trag").run();
  });

  it('1. Genesis Block: Prvi događaj mora krenuti od nultog heša (GENESIS_HASH)', async () => {
    const documentId = "INV-2026-001";
    const xml = "<Invoice>Genesis</Invoice>";
    const xmlHash = await sha256(xml);

    // Pišemo prvi događaj
    const hash = await CryptographicLedger.appendEvent((env as any).REGISTAR_DB, documentId, "VALIDIRAN", { test: true, xmlHash });

    // Čitamo iz baze radi provere
    const record = await (env as any).REGISTAR_DB.prepare(
      "SELECT * FROM revizorski_trag WHERE redosled = 1"
    ).first<any>();

    expect(record).not.toBeNull();
    expect(record.redosled).toBe(1);
    expect(record.prethodni_hash).toBe(GENESIS_HASH);
    
    // Potvrđujemo integritet
    const verification = await CryptographicLedger.verifyChain((env as any).REGISTAR_DB);
    expect(verification.success).toBe(true);
  });

  it('2. Chaining: Više zapisa se mora ulančati hronološki bez grešaka u verifikaciji', async () => {
    const documentId = "INV-2026-002";

    // Simuliramo 3 uzastopna događaja (npr. primljena, validirana, odobrena)
    await CryptographicLedger.appendEvent((env as any).REGISTAR_DB, documentId, "PRIMLJENA", { v: 1 });
    await CryptographicLedger.appendEvent((env as any).REGISTAR_DB, documentId, "VALIDIRANA", { v: 2 });
    await CryptographicLedger.appendEvent((env as any).REGISTAR_DB, documentId, "ODOBRENA", { v: 3 });

    const records = await (env as any).REGISTAR_DB.prepare(
      "SELECT * FROM revizorski_trag ORDER BY redosled ASC"
    ).all();

    expect(records.results.length).toBe(3);
    expect(records.results[0].prethodni_hash).toBe(GENESIS_HASH);
    expect(records.results[1].prethodni_hash).toBe(records.results[0].trenutni_hash);
    expect(records.results[2].prethodni_hash).toBe(records.results[1].trenutni_hash);

    const verification = await CryptographicLedger.verifyChain((env as any).REGISTAR_DB);
    expect(verification.success).toBe(true);
  });

  it('3. Tampering (Update): Detekcija neovlašćene modifikacije vrednosti u istoriji', async () => {
    const documentId = "INV-2026-003";

    await CryptographicLedger.appendEvent((env as any).REGISTAR_DB, documentId, "KREIRANA", { amount: 100 });
    await CryptographicLedger.appendEvent((env as any).REGISTAR_DB, documentId, "POSLATA", { status: 'OK' });

    // HAKOVANJE BZ: Inspektor proverava modifikacije
    // Neko je pokušao da promeni status događaja, ali nije recalculirao hash
    await (env as any).REGISTAR_DB.prepare(
      "UPDATE revizorski_trag SET dogadjaj = 'ODBIJENA' WHERE redosled = 1"
    ).run();

    const verification = await CryptographicLedger.verifyChain((env as any).REGISTAR_DB);
    
    // Sistem MORA da padne i tačno identifikuje redosled gde je nastao problem
    expect(verification.success).toBe(false);
    expect(verification.tamperedIndex).toBe(1);
    expect(verification.message).toContain("neovlašćena promena metapodataka");
  });

  it('4. Tampering (Deletion): Detekcija brisanja istorijskih zapisa iz baze', async () => {
    const documentId = "INV-2026-004";

    await CryptographicLedger.appendEvent((env as any).REGISTAR_DB, documentId, "A", {});
    await CryptographicLedger.appendEvent((env as any).REGISTAR_DB, documentId, "B", {});
    await CryptographicLedger.appendEvent((env as any).REGISTAR_DB, documentId, "C", {});

    // HAKOVANJE BZ: Brisanje "nepodobnog" loga iz sredine
    await (env as any).REGISTAR_DB.prepare(
      "DELETE FROM revizorski_trag WHERE redosled = 2"
    ).run();

    const verification = await CryptographicLedger.verifyChain((env as any).REGISTAR_DB);
    
    expect(verification.success).toBe(false);
    expect(verification.message).toContain("Narušen redosled");
  });

  it('5. Concurrency Retry: Više istovremenih upisa se mora uspešno sekvencirati bez kršenja jedinstvenog indeksa', async () => {
    const documentId = "INV-2026-005";

    // Pokrećemo 5 asinhronih procesa ISTE SEKUNDE. 
    // Pošto svi čitaju "SELECT ... LIMIT 1", ući će u konflikt.
    // Retry mehanizam u appendEvent (backoff) mora ovo da ispegla.
    const promises = Array.from({ length: 5 }).map((_, idx) => {
      return CryptographicLedger.appendEvent((env as any).REGISTAR_DB, documentId, `EVENT-${idx}`, { task: idx });
    });

    await Promise.all(promises);

    const records = await (env as any).REGISTAR_DB.prepare(
      "SELECT * FROM revizorski_trag ORDER BY redosled ASC"
    ).all();

    expect(records.results.length).toBe(5);

    const verification = await CryptographicLedger.verifyChain((env as any).REGISTAR_DB);
    expect(verification.success).toBe(true);
  });
});
