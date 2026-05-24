import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { app } from '../worker/index';

describe('eOtpremnica E2E - Supply Chain State Machine', () => {

  const klijentId = 'klijent_otpremnice_test';
  const pibProdavca = '123456789';
  const pibKupca = '987654321';

  beforeAll(async () => {
    // Inicijalizacija centralne baze (D1)
    await env.REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS dokumenti (
        id TEXT PRIMARY KEY, tip TEXT NOT NULL, broj TEXT NOT NULL,
        pib_prodavca TEXT NOT NULL, pib_kupca TEXT NOT NULL, status TEXT NOT NULL,
        iznos_osnovica REAL DEFAULT 0, iznos_poreza REAL DEFAULT 0, datum_prometa DATETIME,
        xml_blob TEXT, json_metadata TEXT, parent_id TEXT,
        kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP, azurirano_u DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await env.REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS dokument_stavke (
        id INTEGER PRIMARY KEY AUTOINCREMENT, dokument_id TEXT NOT NULL, line_id TEXT,
        naziv TEXT NOT NULL, poslata_kolicina REAL, primljena_kolicina REAL,
        jedinica_mere TEXT, cena REAL, porez_stopa REAL, porez_kategorija TEXT,
        osnovica REAL, iznos_poreza REAL, razlika REAL,
        UNIQUE(dokument_id, line_id)
      )
    `).run();

    await env.REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS dokumenti_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, dokument_id TEXT NOT NULL,
        prethodni_status TEXT, novi_status TEXT NOT NULL, poruka TEXT,
        kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(dokument_id) REFERENCES dokumenti(id)
      )
    `).run();

    await env.REGISTAR_DB.prepare(`
       CREATE TABLE IF NOT EXISTS klijenti (
        klijent_id TEXT PRIMARY KEY, naziv TEXT NOT NULL
      )
    `).run();
  });

  beforeEach(async () => {
    await env.REGISTAR_DB.prepare("DELETE FROM dokumenti_log").run();
    await env.REGISTAR_DB.prepare("DELETE FROM dokument_stavke").run();
    await env.REGISTAR_DB.prepare("DELETE FROM dokumenti").run();
    await env.REGISTAR_DB.prepare("DELETE FROM klijenti").run();
    
    await env.REGISTAR_DB.prepare("INSERT INTO klijenti (klijent_id, naziv) VALUES (?, ?)")
      .bind(klijentId, 'Logistička Firma DOO').run();

    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = env.KLIJENT_BAZA_OBJECT.get(doId);
    
    await klijentDO.fetch(new Request('http://do/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sef_api_key: 'test_key', klijent_id: pibProdavca, limit: 100 })
    }));

    await klijentDO.fetch(new Request('http://do/test/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'RESET_LEDGER', saldo: 100 })
    }));
  });

  it('Treba uspešno poslati otpremnicu i zabilježiti je u D1 SSoT', async () => {
    const otpremnicaData = {
      id: "OTP-2026-X1",
      issueDate: "2026-05-24",
      despatchDate: "2026-05-24",
      supplierPib: pibProdavca,
      customerPib: pibKupca,
      lines: [
        { id: "1", name: "Šljunak", quantity: 10, unitCode: "TNE" },
        { id: "2", name: "Cement", quantity: 50, unitCode: "KGM" }
      ]
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      return new Response(JSON.stringify({ Id: '9999', DocumentNumber: 'OTP-2026-X1' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const res = await app.request('/api/otpremnice/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Klijent-ID': klijentId },
      body: JSON.stringify(otpremnicaData)
    }, env);

    if (res.status === 400) {
      console.log("OTPREMNICA ERROR:", await res.text());
    }

    expect(res.status).toBe(202);
    const result = await res.json() as any;
    expect(result.success).toBe(true);
    const internalId = result.internalId;

    // Verifikacija u D1 (Centralna baza)
    const doc = await env.REGISTAR_DB.prepare("SELECT * FROM dokumenti WHERE id = ?").bind(internalId).first() as any;
    expect(doc).toBeDefined();
    expect(doc.tip).toBe('OTPREMNICA');
    expect(doc.broj).toBe('OTP-2026-X1');
    expect(doc.status).toBe('SENT');

    // Verifikacija Audit Loga
    const log = await env.REGISTAR_DB.prepare("SELECT * FROM dokumenti_log WHERE dokument_id = ?").bind(internalId).first() as any;
    expect(log).toBeDefined();
    expect(log.novi_status).toBe('SENT');

    const stavke = await env.REGISTAR_DB.prepare("SELECT * FROM dokument_stavke WHERE dokument_id = ?").bind(internalId).all();
    expect(stavke.results.length).toBe(2);
    expect(stavke.results.find((s:any) => s.naziv === 'Šljunak').poslata_kolicina).toBe(10);

    fetchSpy.mockRestore();
  });
});
