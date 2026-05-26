import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, beforeAll, vi, afterEach } from 'vitest';
import type { SefInvoiceData } from '@sef/shared/types/sef';

describe('KlijentBaza: SEF E2E Integration', () => {
  const klijentId = 'klijent_test_pib';
  const doId = (env as any).KLIJENT_BAZA_OBJECT.idFromName(klijentId);
  const klijentDO = (env as any).KLIJENT_BAZA_OBJECT.get(doId);

  beforeAll(async () => {
    // Čišćenje šeme
    await (env as any).REGISTAR_DB.prepare("DROP TABLE IF EXISTS dokumenti").run();
    await (env as any).REGISTAR_DB.prepare("DROP TABLE IF EXISTS dokument_stavke").run();
    await (env as any).REGISTAR_DB.prepare("DROP TABLE IF EXISTS dokumenti_log").run();
    await (env as any).REGISTAR_DB.prepare("DROP TABLE IF EXISTS klijenti").run();

    await (env as any).REGISTAR_DB.prepare(`
       CREATE TABLE IF NOT EXISTS klijenti (klijent_id TEXT PRIMARY KEY, naziv TEXT NOT NULL)
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

  beforeEach(async () => {
    // Reset configuration for the DO
    await klijentDO.fetch(new Request('http://do/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        sef_api_key: 'test_key', 
        environment: 'sandbox',
        limit: 50
      })
    }));
    // Ensure ledger is healthy (50 credits)
    await klijentDO.fetch(new Request('http://do/test/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'RESET_LEDGER', saldo: 50 })
    }));
  });

  it('1. Happy Path - Success on first attempt', async () => {
    const invoiceId = `INV-${Date.now()}`;
    const invoiceData: any = {
      ID: invoiceId,
      InvoiceTypeCode: "380",
      IssueDate: "2026-05-20",
      DueDate: "2026-06-03",
      DocumentCurrencyCode: "RSD",
      Supplier: { Pib: '101134702', Name: 'Supplier', Address: { City: 'Beograd', CountryCode: 'RS' } },
      Customer: { Pib: '113398540', Name: 'Customer', Address: { City: 'Novi Sad', CountryCode: 'RS' } },
      TaxTotals: [{
        TaxAmount: 20,
        Subtotals: [{ TaxableAmount: 100, TaxAmount: 20, Category: 'S', Percent: 20 }]
      }],
      LegalMonetaryTotal: { LineExtensionAmount: 100, TaxExclusiveAmount: 100, TaxInclusiveAmount: 120, AllowanceTotalAmount: 0, PrepaidAmount: 0, PayableRoundingAmount: 0, PayableAmount: 120 },
      Lines: [{
        ID: "1", Quantity: 1, UnitCode: "H87", LineExtensionAmount: 100, Price: 100, ItemName: "Test Item", VatCategory: "S", VatPercent: 20
      }]
    };

    const res = await klijentDO.fetch(new Request('http://do/fakture/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invoiceData)
    }));

    expect(res.status).toBe(202);
  });

  it('2. Ecosystem Recovery - Eventually Sent', async () => {
    const invoiceId = `INV-RETRY-${Date.now()}`;
    const invoiceData: any = {
      ID: invoiceId,
      InvoiceTypeCode: "380",
      IssueDate: "2026-05-20",
      DueDate: "2026-06-03",
      DocumentCurrencyCode: "RSD",
      Supplier: { Pib: '101134702', Name: 'Supplier', Address: { City: 'Beograd', CountryCode: 'RS' } },
      Customer: { Pib: '113398540', Name: 'Customer', Address: { City: 'Novi Sad', CountryCode: 'RS' } },
      TaxTotals: [{
        TaxAmount: 20,
        Subtotals: [{ TaxableAmount: 100, TaxAmount: 20, Category: 'S', Percent: 20 }]
      }],
      LegalMonetaryTotal: { LineExtensionAmount: 100, TaxExclusiveAmount: 100, TaxInclusiveAmount: 120, AllowanceTotalAmount: 0, PrepaidAmount: 0, PayableRoundingAmount: 0, PayableAmount: 120 },
      Lines: [{
        ID: "1", Quantity: 1, UnitCode: "H87", LineExtensionAmount: 100, Price: 100, ItemName: "Test Item", VatCategory: "S", VatPercent: 20
      }]
    };

    await klijentDO.fetch(new Request('http://do/fakture/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invoiceData)
    }));
    
    // Simulišemo uspeh na SEF-u (ručno) pošto je DO u izolaciji
    await klijentDO.fetch(new Request('http://do/webhooks/sef-update?smer=SALES', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faktura_id: invoiceId, novi_status: 'Sent' })
    }));

    const statsRes = await klijentDO.fetch(new Request('http://do/stats'));
    const stats = await statsRes.json() as any;
    console.log('STATS:', stats);
    expect(stats.stats.find((s: any) => s.status === 'Sent')?.broj).toBeGreaterThan(0);
  });

  it('3. Limit Enforcement - Blocking when monthly quota reached', async () => {
    await klijentDO.fetch(new Request('http://do/test/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { limit_faktura: 0 } })
    }));

    const invoiceData: any = {
      ID: "LIMIT-TEST-99",
      InvoiceTypeCode: "380",
      IssueDate: "2026-05-24",
      DueDate: "2026-06-03",
      DocumentCurrencyCode: "RSD",
      Supplier: { Pib: '101134702', Name: 'Supplier', Address: { City: 'BG', CountryCode: 'RS' } },
      Customer: { Pib: '113398540', Name: 'Customer', Address: { City: 'NS', CountryCode: 'RS' } },
      TaxTotals: [{
        TaxAmount: 20,
        Subtotals: [{ TaxableAmount: 100, TaxAmount: 20, Category: 'S', Percent: 20 }]
      }],
      LegalMonetaryTotal: { LineExtensionAmount: 100, TaxExclusiveAmount: 100, TaxInclusiveAmount: 120, AllowanceTotalAmount: 0, PrepaidAmount: 0, PayableRoundingAmount: 0, PayableAmount: 120 },
      Lines: [{ ID: "1", Quantity: 1, UnitCode: "H87", LineExtensionAmount: 100, Price: 100, ItemName: "Test", VatCategory: "S", VatPercent: 20 }]
    };

    const res = await klijentDO.fetch(new Request('http://do/fakture/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invoiceData)
    }));

    expect(res.status).toBe(402);
    const body = await res.json() as any;
    expect(body.error).toBe("LIMIT_EXCEEDED");
  });
});
