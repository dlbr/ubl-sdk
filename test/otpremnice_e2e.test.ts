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
        id TEXT PRIMARY KEY,
        tip TEXT NOT NULL,
        broj TEXT NOT NULL,
        pib_prodavca TEXT NOT NULL,
        pib_kupca TEXT NOT NULL,
        status TEXT NOT NULL,
        xml_blob TEXT,
        json_metadata TEXT,
        parent_doc_id TEXT,
        kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP,
        azurirano_u DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `).run();

    await env.REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS dokument_stavke (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dokument_id TEXT NOT NULL,
        line_id TEXT,
        naziv TEXT NOT NULL,
        poslata_kolicina REAL,
        primljena_kolicina REAL,
        jedinica_mere TEXT,
        cena REAL,
        razlika REAL
      );
    `).run();

    await env.REGISTAR_DB.prepare(`
       CREATE TABLE IF NOT EXISTS klijenti (
        klijent_id TEXT PRIMARY KEY, naziv TEXT NOT NULL
      )
    `).run();
  });

  beforeEach(async () => {
    await env.REGISTAR_DB.prepare("DELETE FROM dokumenti").run();
    await env.REGISTAR_DB.prepare("DELETE FROM dokument_stavke").run();
    await env.REGISTAR_DB.prepare("DELETE FROM klijenti").run();
    
    await env.REGISTAR_DB.prepare("INSERT INTO klijenti (klijent_id, naziv) VALUES (?, ?)")
      .bind(klijentId, 'Logistička Firma DOO').run();

    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = env.KLIJENT_BAZA_OBJECT.get(doId);
    
    await klijentDO.fetch(new Request('http://do/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sef_api_key: 'test_key', limit: 100 })
    }));

    await klijentDO.fetch(new Request('http://do/test/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'RESET_LEDGER', saldo: 100 })
    }));
  });

  it('Treba uspešno poslati otpremnicu i zabilježiti je u D1 SSoT', async () => {
    const otpremnicaData = {
      ID: "OTP-2026-X1",
      IssueDate: "2026-05-24",
      Supplier: { 
        Pib: pibProdavca, Name: "Prodavac", 
        Address: { City: "Beograd", CountryCode: "RS" } 
      },
      Customer: { 
        Pib: pibKupca, Name: "Kupac", 
        Address: { City: "Novi Sad", CountryCode: "RS" } 
      },
      Lines: [
        { ID: "1", ItemName: "Šljunak", DeliveredQuantity: 10, UnitCode: "TNE" },
        { ID: "2", ItemName: "Cement", DeliveredQuantity: 50, UnitCode: "KGM" }
      ]
    };

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

    const stavke = await env.REGISTAR_DB.prepare("SELECT * FROM dokument_stavke WHERE dokument_id = ?").bind(internalId).all();
    expect(stavke.results.length).toBe(2);
    expect(stavke.results.find((s:any) => s.naziv === 'Šljunak').poslata_kolicina).toBe(10);
  });
});
