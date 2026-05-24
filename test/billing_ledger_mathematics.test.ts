import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { app } from '../worker/index';

describe('Billing Ledger v3.5.0 — Transactional Mathematics Audit', () => {

  const klijentId = 'klijent_ledger_test';

  beforeAll(async () => {
    // Inicijalizacija baze (centralne)
    await env.REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS klijenti (
        klijent_id TEXT PRIMARY KEY, naziv TEXT NOT NULL,
        ima_aktivne_fakture INTEGER DEFAULT 0, poslednji_sync DATETIME DEFAULT '1970-01-01 00:00:00'
      )
    `).run();

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
  });

  beforeEach(async () => {
    await env.REGISTAR_DB.prepare("DELETE FROM klijenti").run();
    await env.REGISTAR_DB.prepare("DELETE FROM dokumenti").run();
    await env.REGISTAR_DB.prepare("DELETE FROM dokument_stavke").run();

    await env.REGISTAR_DB.prepare("INSERT INTO klijenti (klijent_id, naziv) VALUES (?, ?)")
      .bind(klijentId, 'Ledger Test Firma').run();

    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = env.KLIJENT_BAZA_OBJECT.get(doId);
    
    // Inicijalizacija DO
    await klijentDO.fetch(new Request('http://do/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sef_api_key: 'test_key', limit: 50 })
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
      IssueDate: "2026-05-24",
      DueDate: "2026-05-24",
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

    if (res.status === 422) {
      console.log("VALIDATION ERROR:", await res.text());
    }

    expect(res.status).toBe(202);

    const analyticsRes = await app.request('/api/analytics/potrosnja', {
      method: 'GET',
      headers: { 'X-Klijent-ID': klijentId }
    }, env);
    const analytics = await analyticsRes.json() as any;

    expect(analytics.saldo).toBe(49);
    expect(analytics.izvod[0].tip_transakcije).toBe('POTROŠNJA');
  });

  it('Treba da izvrši REFUNDACIJU kredita kada stigne webhook status Rejected', async () => {
    const invoiceId = "LEDGER-REF-001";
    const sefId = "999888";

    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = env.KLIJENT_BAZA_OBJECT.get(doId);

    // 1. Seed-ujemo fakturu kao 'Sent' sa rezervisanim kreditom
    await klijentDO.fetch(new Request('http://do/test/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fakture: [{ internal_id: invoiceId, sef_id: sefId, broj_fakture: 'F-1', status: 'Sent', iznos: 1000 }]
      })
    }));

    // Potrošimo 1 kredit ručno za taj internal_id
    await klijentDO.fetch(new Request('http://do/test/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'RESET_LEDGER', saldo: 49 }) 
    }));

    // Webhook: Rejected
    await klijentDO.fetch(new Request('http://do/webhooks/sef-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faktura_id: sefId, novi_status: 'Rejected' })
    }));

    const analyticsRes = await klijentDO.fetch('http://do/api/analytics/potrosnja');
    const analytics = await analyticsRes.json() as any;

    expect(analytics.saldo).toBe(50); // Vraćeno na 50
    expect(analytics.izvod[0].tip_transakcije).toBe('REFUNDACIJA');
  });

  it('Treba da spreči duplu refundaciju (Idempotency Audit)', async () => {
    const invoiceId = "LEDGER-IDEM-001";
    const sefId = "777888";
    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = env.KLIJENT_BAZA_OBJECT.get(doId);

    await klijentDO.fetch(new Request('http://do/test/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fakture: [{ internal_id: invoiceId, sef_id: sefId, broj_fakture: 'F-IDEM', status: 'Sent', iznos: 1000 }]
      })
    }));

    await klijentDO.fetch(new Request('http://do/test/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'RESET_LEDGER', saldo: 49 }) 
    }));

    // Webhook 1: Rejected
    await klijentDO.fetch(new Request('http://do/webhooks/sef-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faktura_id: sefId, novi_status: 'Rejected' })
    }));

    // Webhook 2: Ponovo Rejected (npr. greška u SEF-u ili ponovljen webhook)
    await klijentDO.fetch(new Request('http://do/webhooks/sef-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faktura_id: sefId, novi_status: 'Rejected' })
    }));

    const analyticsRes = await klijentDO.fetch('http://do/api/analytics/potrosnja');
    const analytics = await analyticsRes.json() as any;

    expect(analytics.saldo).toBe(50); // I dalje 50, nije 51
  });
});
