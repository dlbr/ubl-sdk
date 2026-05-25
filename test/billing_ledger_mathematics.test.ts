import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, beforeAll, vi, afterAll } from 'vitest';
import { app } from '../packages/backend/src/index';

describe('Billing Ledger v3.5.0 — Transactional Mathematics Audit', () => {

  const klijentId = 'klijent_ledger_pib';
  
  beforeAll(async () => {
    // Čišćenje šeme radi osiguranja ispravne strukture (sef_id)
    await (env as any).REGISTAR_DB.prepare("DROP TABLE IF EXISTS dokumenti").run();
    await (env as any).REGISTAR_DB.prepare("DROP TABLE IF EXISTS dokument_stavke").run();
    await (env as any).REGISTAR_DB.prepare("DROP TABLE IF EXISTS dokumenti_log").run();
    await (env as any).REGISTAR_DB.prepare("DROP TABLE IF EXISTS klijenti").run();

    await (env as any).REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS klijenti (
        klijent_id TEXT PRIMARY KEY, naziv TEXT NOT NULL,
        ima_aktivne_fakture INTEGER DEFAULT 0, poslednji_sync DATETIME DEFAULT '1970-01-01 00:00:00'
      )
    `).run();

    // Inicijalizacija centralne baze (D1)
    await (env as any).REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS dokumenti (
        id TEXT PRIMARY KEY,
        sef_id TEXT UNIQUE,
        tip TEXT NOT NULL,
        broj TEXT NOT NULL,
        pib_prodavca TEXT NOT NULL,
        pib_kupca TEXT NOT NULL,
        status TEXT NOT NULL,
        iznos_osnovica REAL DEFAULT 0,
        iznos_poreza REAL DEFAULT 0,
        datum_prometa DATETIME,
        xml_blob TEXT,
        json_metadata TEXT,
        parent_id TEXT,
        kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP,
        azurirano_u DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await (env as any).REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS dokument_stavke (
        id INTEGER PRIMARY KEY AUTOINCREMENT, dokument_id TEXT NOT NULL, line_id TEXT,
        naziv TEXT NOT NULL, poslata_kolicina REAL, primljena_kolicina REAL,
        jedinica_mere TEXT, cena REAL, porez_stopa REAL, porez_kategorija TEXT,
        osnovica REAL, iznos_poreza REAL, razlika REAL,
        akcizna_kategorija TEXT, akcizna_gustina REAL, izvorna_stavka_id TEXT,
        UNIQUE(dokument_id, line_id)
      )
    `).run();

    await (env as any).REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS dokumenti_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, dokument_id TEXT NOT NULL,
        prethodni_status TEXT, novi_status TEXT NOT NULL, poruka TEXT,
        kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(dokument_id) REFERENCES dokumenti(id)
      )
    `).run();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(async () => {
    await (env as any).REGISTAR_DB.prepare("DELETE FROM klijenti").run();
    await (env as any).REGISTAR_DB.prepare("DELETE FROM dokumenti").run();
    await (env as any).REGISTAR_DB.prepare("DELETE FROM dokument_stavke").run();

    await (env as any).REGISTAR_DB.prepare("INSERT INTO klijenti (klijent_id, naziv) VALUES (?, ?)")
      .bind(klijentId, 'Audit Firma').run();

    const doId = (env as any).KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = (env as any).KLIJENT_BAZA_OBJECT.get(doId);
    
    await klijentDO.fetch(new Request('http://do/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sef_api_key: 'audit_key', klijent_id: '123456789', limit: 100 })
    }));

    await klijentDO.fetch(new Request('http://do/test/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'RESET_LEDGER', saldo: 50 })
    }));
  });

  it('Treba ispravno da rezerviše kredit pri slanju i prikaže u analitici', async () => {
    const invoiceData: any = {
      ID: "FKT-LEDGER-001",
      IssueDate: "2026-05-25",
      DueDate: "2026-05-25",
      InvoiceTypeCode: "380",
      DocumentCurrencyCode: "RSD",
      Supplier: { 
        Pib: "123456789", Name: "Prodavac", 
        Address: { City: "BG", CountryCode: "RS" } 
      },
      Customer: { 
        Pib: "987654321", Name: "Kupac", 
        Address: { City: "NS", CountryCode: "RS" } 
      },
      LegalMonetaryTotal: { 
        LineExtensionAmount: 100, TaxExclusiveAmount: 100, TaxInclusiveAmount: 120, 
        AllowanceTotalAmount: 0, PrepaidAmount: 0, PayableRoundingAmount: 0, PayableAmount: 120 
      },
      Lines: [{ 
        ID: "1", Quantity: 1, UnitCode: "H87", 
        LineExtensionAmount: 100, Price: 100, ItemName: "Usluga", 
        VatCategory: "S", VatPercent: 20 
      }]
    };

    const res = await app.request('/api/fakture/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Klijent-ID': klijentId },
      body: JSON.stringify(invoiceData)
    }, env);

    if (res.status === 400) {
      console.log("SEND ERROR:", await res.text());
    }

    expect(res.status).toBe(202);

    const analyticsRes = await app.request('/api/analytics/potrosnja', {
      method: 'GET',
      headers: { 'X-Klijent-ID': klijentId }
    }, env);

    const stats = await analyticsRes.json() as any;
    expect(stats.rezervisano).toBe(1);
    expect(stats.preostalo).toBe(49);
  });

  it('Treba da izvrši REFUNDACIJU kredita kada stigne webhook status Rejected', async () => {
    const doId = (env as any).KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = (env as any).KLIJENT_BAZA_OBJECT.get(doId);

    // 1. Seed-ujemo fakturu kao 'Sent' sa rezervisanim kreditom
    await klijentDO.fetch(new Request('http://do/test/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        action: 'SEED_DOCUMENT', 
        doc: { id: 'FKT-REJ-01', tip: '380', broj: 'FKT-REJ-01', pibProdavca: '123456789', pibKupca: '999', status: 'SENT' } 
      })
    }));

    // 2. Simuliramo Webhook odbijanje
    const webhookRes = await app.request('/api/webhooks/sef-update?smer=SALES', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Klijent-ID': klijentId },
      body: JSON.stringify({
        id: 'FKT-REJ-01',
        status: 'Rejected'
      })
    }, env);

    expect(webhookRes.status).toBe(200);

    // 3. Provera salda - treba da bude ponovo 50 (49 + 1 refundacija)
    const analyticsRes = await app.request('/api/analytics/potrosnja', {
      method: 'GET',
      headers: { 'X-Klijent-ID': klijentId }
    }, env);

    const stats = await analyticsRes.json() as any;
    expect(stats.preostalo).toBe(50);
  });

  it('Treba da spreči duplu refundaciju (Idempotency Audit)', async () => {
    const doId = (env as any).KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = (env as any).KLIJENT_BAZA_OBJECT.get(doId);

    await klijentDO.fetch(new Request('http://do/test/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        action: 'SEED_DOCUMENT', 
        doc: { id: 'FKT-DUP-01', tip: '380', broj: 'FKT-DUP-01', pibProdavca: '123456789', pibKupca: '999', status: 'SENT' } 
      })
    }));

    // Prvi put
    await app.request('/api/webhooks/sef-update?smer=SALES', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Klijent-ID': klijentId },
      body: JSON.stringify({ id: 'FKT-DUP-01', status: 'Rejected' })
    }, env);

    // Drugi put (duplicate)
    const res2 = await app.request('/api/webhooks/sef-update?smer=SALES', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Klijent-ID': klijentId },
      body: JSON.stringify({ id: 'FKT-DUP-01', status: 'Rejected' })
    }, env);

    expect(res2.status).toBe(200);

    const analyticsRes = await app.request('/api/analytics/potrosnja', {
      method: 'GET',
      headers: { 'X-Klijent-ID': klijentId }
    }, env);

    const stats = await analyticsRes.json() as any;
    expect(stats.preostalo).toBe(50); // Ne sme biti 51!
  });
});
