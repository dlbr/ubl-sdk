import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { app } from '../worker/index';

describe('eOtpremnica Reconciliation - Discrepancy Detection', () => {

  const klijentId = 'klijent_logistika_audit';
  const pibProdavca = '111222333';
  const pibKupca = '444555666';

  beforeAll(async () => {
    // Inicijalizacija baze (SSoT)
    await env.REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS dokumenti (
        id TEXT PRIMARY KEY, tip TEXT NOT NULL, broj TEXT NOT NULL,
        pib_prodavca TEXT NOT NULL, pib_kupca TEXT NOT NULL, status TEXT NOT NULL,
        iznos_osnovica REAL DEFAULT 0, iznos_poreza REAL DEFAULT 0, datum_prometa DATETIME,
        xml_blob TEXT, json_metadata TEXT, parent_id TEXT,
        kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP, azurirano_u DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `).run();

    await env.REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS dokument_stavke (
        id INTEGER PRIMARY KEY AUTOINCREMENT, dokument_id TEXT NOT NULL, line_id TEXT,
        naziv TEXT NOT NULL, poslata_kolicina REAL, primljena_kolicina REAL,
        jedinica_mere TEXT, cena REAL, porez_stopa REAL, porez_kategorija TEXT,
        osnovica REAL, iznos_poreza REAL, razlika REAL,
        UNIQUE(dokument_id, line_id)
      );
    `).run();
    
    await env.REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS dokumenti_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dokument_id TEXT NOT NULL,
        prethodni_status TEXT,
        novi_status TEXT NOT NULL,
        poruka TEXT,
        kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(dokument_id) REFERENCES dokumenti(id)
      );
    `).run();
    
    await env.REGISTAR_DB.prepare(`CREATE TABLE IF NOT EXISTS klijenti (klijent_id TEXT PRIMARY KEY, naziv TEXT NOT NULL)`).run();
  });

  beforeEach(async () => {
    await env.REGISTAR_DB.prepare("DELETE FROM dokumenti_log").run();
    await env.REGISTAR_DB.prepare("DELETE FROM dokument_stavke").run();
    await env.REGISTAR_DB.prepare("DELETE FROM dokumenti").run();
    await env.REGISTAR_DB.prepare("DELETE FROM klijenti").run();
    
    await env.REGISTAR_DB.prepare("INSERT INTO klijenti (klijent_id, naziv) VALUES (?, ?)")
      .bind(klijentId, 'Logistički Audit DOO').run();

    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = env.KLIJENT_BAZA_OBJECT.get(doId);
    
    await klijentDO.fetch(new Request('http://do/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sef_api_key: 'audit_key', limit: 1000 })
    }));
  });

  it('Treba detektovati manjak (Shortage) i automatski označiti otpremnicu kao DISCREPANCY', async () => {
    // 1. ŠALJEMO OTPREMNICU (100 komada)
    const otpremnicaData = {
      id: "OTP-RECON-01", 
      issueDate: "2026-05-24",
      despatchDate: "2026-05-24",
      supplierPib: pibProdavca,
      customerPib: pibKupca,
      lines: [{ id: "1", name: "Cigla", quantity: 100, unitCode: "PCE" }]
    };

    const sendRes = await app.request('/api/otpremnice/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Klijent-ID': klijentId },
      body: JSON.stringify(otpremnicaData)
    }, env);
    
    if (sendRes.status === 400) {
      console.log("SEND ERROR:", await sendRes.text());
    }
    expect(sendRes.status).toBe(202);

    // 2. PRIMAMO PRIJEMNICU (90 komada primljeno, 10 manjak)
    const prijemnicaData = {
      id: "REC-RECON-01", 
      issueDate: "2026-05-24",
      despatchReference: { id: "OTP-RECON-01" },
      supplierPib: pibProdavca,
      customerPib: pibKupca,
      lines: [{ 
        id: "1", itemName: "Cigla", 
        receivedQuantity: 90, shortQuantity: 10, 
        unitCode: "PCE", despatchLineId: "1" 
      }]
    };

    const receiveRes = await app.request('/api/prijemnice/receive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Klijent-ID': klijentId },
      body: JSON.stringify(prijemnicaData)
    }, env);

    if (receiveRes.status === 400) {
      console.log("RECEIVE ERROR:", await receiveRes.text());
    }

    if (receiveRes.status === 422) {
      console.log("RECEIVE VALIDATION ERROR:", await receiveRes.text());
    }

    expect(receiveRes.status).toBe(202);
    const recResult = await receiveRes.json() as any;
    expect(recResult.hasDiscrepancy).toBe(true);

    // 3. VERIFIKACIJA LANCA (D1 Audit)
    const otpDoc = await env.REGISTAR_DB.prepare("SELECT status FROM dokumenti WHERE broj = 'OTP-RECON-01'").first() as any;
    expect(otpDoc.status).toBe('DISCREPANCY');

    const stavka = await env.REGISTAR_DB.prepare("SELECT * FROM dokument_stavke WHERE line_id = '1' AND dokument_id LIKE 'OTP-%'").first() as any;
    expect(stavka.poslata_kolicina).toBe(100);
    expect(stavka.primljena_kolicina).toBe(90);
    expect(stavka.razlika).toBe(10);
  });

  it('Treba da ažurira status preko webhook rute i loguje događaj', async () => {
    const otpId = 'OTP-WEBHOOK-999';
    const bridge = new D1SyncBridge(env.REGISTAR_DB);

    // 1. Inicijalni upis
    await bridge.upsertDocument({
      id: otpId, tip: 'OTPREMNICA', broj: otpId, pibProdavca: pibProdavca, pibKupca: pibKupca, status: 'SENT'
    });

    // 2. Webhook poziv
    const res = await app.request('/api/webhooks/otpremnice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: otpId, status: 'CONFIRMED', pib_kompanije: pibProdavca })
    }, env);

    expect(res.status).toBe(200);

    // 3. Verifikacija u D1
    const doc = await env.REGISTAR_DB.prepare("SELECT status FROM dokumenti WHERE id = ?").bind(otpId).first() as any;
    expect(doc.status).toBe('CONFIRMED');

    // 4. Verifikacija loga
    const log = await env.REGISTAR_DB.prepare("SELECT * FROM dokumenti_log WHERE dokument_id = ? AND novi_status = 'CONFIRMED'").bind(otpId).first() as any;
    expect(log).toBeDefined();
  });
});
