import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { CryptographicLedger, sha256 } from '../packages/shared/services/CryptographicLedger';

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
        xml_hash TEXT NOT NULL,
        dogadjaj TEXT NOT NULL,
        detalji TEXT,
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

  it('1. Genesis Block: Prvi događaj mora krenuti od SEF_SYSTEM_GENESIS_2026 heša', async () => {
    const documentId = "INV-2026-001";
    const xml = "<Invoice>Genesis</Invoice>";
    const xmlHash = await sha256(xml);
    const expectedGenesisHash = await sha256("SEF_SYSTEM_GENESIS_2026");

    // Pišemo prvi događaj
    const hash = await CryptographicLedger.appendEvent((env as any).REGISTAR_DB, documentId, xml, "VALIDIRAN", { test: true });

    // Čitamo iz baze radi provere
    const record = await (env as any).REGISTAR_DB.prepare(
      "SELECT * FROM revizorski_trag WHERE redosled = 1"
    ).first<any>();

    expect(record).not.toBeNull();
    expect(record.redosled).toBe(1);
    expect(record.prethodni_hash).toBe(expectedGenesisHash);
    expect(record.xml_hash).toBe(xmlHash);
    expect(record.dogadjaj).toBe("VALIDIRAN");
    expect(record.trenutni_hash).toBe(hash);

    // Lanac mora biti 100% verifikovan
    const verification = await CryptographicLedger.verifyChain((env as any).REGISTAR_DB);
    expect(verification.success).toBe(true);
  });

  it('2. Chaining: Više zapisa se mora ulančati hronološki bez grešaka u verifikaciji', async () => {
    const db = (env as any).REGISTAR_DB;

    // Upisujemo 3 sekvencijalna događaja za istu fakturu
    const hash1 = await CryptographicLedger.appendEvent(db, "INV-1", "<xml>1</xml>", "VALIDIRAN");
    const hash2 = await CryptographicLedger.appendEvent(db, "INV-1", "<xml>2</xml>", "POSLAT");
    const hash3 = await CryptographicLedger.appendEvent(db, "INV-1", "<xml>3</xml>", "POTVRĐEN");

    // Proveravamo ulančavanje u bazi
    const r2 = await db.prepare("SELECT prethodni_hash, trenutni_hash FROM revizorski_trag WHERE redosled = 2").first<any>();
    const r3 = await db.prepare("SELECT prethodni_hash, trenutni_hash FROM revizorski_trag WHERE redosled = 3").first<any>();

    expect(r2.prethodni_hash).toBe(hash1);
    expect(r3.prethodni_hash).toBe(hash2);
    expect(r3.trenutni_hash).toBe(hash3);

    // Provera lanca za sva 3 elementa
    const verification = await CryptographicLedger.verifyChain(db);
    expect(verification.success).toBe(true);
  });

  it('3. Tampering (Update): Detekcija neovlašćene modifikacije vrednosti u istoriji', async () => {
    const db = (env as any).REGISTAR_DB;

    // Upisujemo događaje
    await CryptographicLedger.appendEvent(db, "INV-9", "<xml>A</xml>", "POSLAT");
    await CryptographicLedger.appendEvent(db, "INV-9", "<xml>B</xml>", "POTVRĐEN");

    // Simulišemo napad: menjamo status na prvoj fakturi direktno u bazi
    await db.prepare("UPDATE revizorski_trag SET dogadjaj = 'ODBIJEN' WHERE redosled = 1").run();

    // Verifikacija lanca MORA da detektuje provalu i vrati neuspeh na zapisu 1
    const verification = await CryptographicLedger.verifyChain(db);
    expect(verification.success).toBe(false);
    expect(verification.tamperedIndex).toBe(1);
    expect(verification.message).toContain("Detektovana neovlašćena promena");
  });

  it('4. Tampering (Deletion): Detekcija brisanja istorijskih zapisa iz baze', async () => {
    const db = (env as any).REGISTAR_DB;

    await CryptographicLedger.appendEvent(db, "INV-10", "<xml>1</xml>", "POSLAT");
    await CryptographicLedger.appendEvent(db, "INV-11", "<xml>2</xml>", "POSLAT");
    await CryptographicLedger.appendEvent(db, "INV-12", "<xml>3</xml>", "POSLAT");

    // Simulišemo napad: brišemo srednji zapis (redosled = 2)
    await db.prepare("DELETE FROM revizorski_trag WHERE redosled = 2").run();

    // Verifikacija lanca MORA da detektuje provalu usled nepoklapanja heševa i redosleda
    const verification = await CryptographicLedger.verifyChain(db);
    expect(verification.success).toBe(false);
    expect(verification.message).toContain("Narušen redosled");
  });

  it('5. Concurrency Retry: Više istovremenih upisa se mora uspešno sekvencirati bez kršenja jedinstvenog indeksa', async () => {
    const db = (env as any).REGISTAR_DB;

    // Pokrećemo 3 paralelna upisa u istoj milisekundi
    const promises = [
      CryptographicLedger.appendEvent(db, "INV-C", "<xml>C1</xml>", "VALIDIRAN"),
      CryptographicLedger.appendEvent(db, "INV-C", "<xml>C2</xml>", "POSLAT"),
      CryptographicLedger.appendEvent(db, "INV-C", "<xml>C3</xml>", "POTVRĐEN")
    ];

    const hashes = await Promise.all(promises);

    expect(hashes).toHaveLength(3);

    // Proveravamo da li su svi redovi upisani sekvencijalno (redosled = 1, 2, 3)
    const records = await db.prepare("SELECT redosled, trenutni_hash FROM revizorski_trag ORDER BY redosled ASC").all();
    expect(records.results).toHaveLength(3);
    expect(records.results[0].redosled).toBe(1);
    expect(records.results[1].redosled).toBe(2);
    expect(records.results[2].redosled).toBe(3);

    // Verifikujemo da je lanac i dalje savršeno zdrav
    const verification = await CryptographicLedger.verifyChain(db);
    expect(verification.success).toBe(true);
  });
});
