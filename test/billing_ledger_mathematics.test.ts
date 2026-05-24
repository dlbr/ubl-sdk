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
  });

  beforeEach(async () => {
    await env.REGISTAR_DB.prepare("DELETE FROM klijenti").run();
  });

  it('Treba ispravno da rezerviše kredit pri slanju i prikaže u analitici', async () => {
    const kId = 'klijent_ledger_1';
    await env.REGISTAR_DB.prepare("INSERT INTO klijenti (klijent_id, naziv) VALUES (?, ?)")
      .bind(kId, 'Ledger 1').run();
    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(kId);
    const klijentDO = env.KLIJENT_BAZA_OBJECT.get(doId);
    
    await klijentDO.fetch(new Request('http://do/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sef_api_key: 'test_key', limit: 50 })
    }));

    const invoiceData = {
      ID: "LEDGER-1", IssueDate: "2026-05-21", DueDate: "2026-05-30",
      InvoiceTypeCode: "380", DocumentCurrencyCode: "RSD",
      Supplier: { Pib: "123456789", Name: "Test", Address: { City: "BG", CountryCode: "RS" } },
      Customer: { Pib: "987654321", Name: "Kupac", Address: { City: "BG", CountryCode: "RS" } },
      LegalMonetaryTotal: { LineExtensionAmount: 100, TaxExclusiveAmount: 100, TaxInclusiveAmount: 120, AllowanceTotalAmount: 0, PrepaidAmount: 0, PayableRoundingAmount: 0, PayableAmount: 120 },
      Lines: [{ ID: "1", Quantity: 1, UnitCode: "H87", LineExtensionAmount: 100, Price: 100, ItemName: "Usluga", VatCategory: "S", VatPercent: 20 }]
    };

    const mockCtx = { waitUntil: (p: any) => p, passThroughOnException: () => {} };

    await app.fetch(new Request('http://localhost/api/fakture/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Klijent-ID': kId },
      body: JSON.stringify(invoiceData)
    }), env, mockCtx as any);

    const analyticsRes = await klijentDO.fetch(new Request('http://do/api/analytics/potrosnja'));
    const analytics = await analyticsRes.json() as any;

    expect(analytics.saldo).toBe(49);
    expect(analytics.izvod[0].tip_transakcije).toBe('POTROŠNJA');
  });

  it('Treba da izvrši REFUNDACIJU kredita kada stigne webhook status Rejected', async () => {
    const kId = 'klijent_ledger_2';
    await env.REGISTAR_DB.prepare("INSERT INTO klijenti (klijent_id, naziv) VALUES (?, ?)")
      .bind(kId, 'Ledger 2').run();
    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(kId);
    const klijentDO = env.KLIJENT_BAZA_OBJECT.get(doId);
    
    await klijentDO.fetch(new Request('http://do/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sef_api_key: 'test_key', limit: 50 })
    }));

    const invoiceData = {
      ID: "LEDGER-2", IssueDate: "2026-05-21", DueDate: "2026-05-30",
      InvoiceTypeCode: "380", DocumentCurrencyCode: "RSD",
      Supplier: { Pib: "123456789", Name: "Test", Address: { City: "BG", CountryCode: "RS" } },
      Customer: { Pib: "987654321", Name: "Kupac", Address: { City: "BG", CountryCode: "RS" } },
      LegalMonetaryTotal: { LineExtensionAmount: 100, TaxExclusiveAmount: 100, TaxInclusiveAmount: 120, AllowanceTotalAmount: 0, PrepaidAmount: 0, PayableRoundingAmount: 0, PayableAmount: 120 },
      Lines: [{ ID: "1", Quantity: 1, UnitCode: "H87", LineExtensionAmount: 100, Price: 100, ItemName: "Usluga", VatCategory: "S", VatPercent: 20 }]
    };

    const mockCtx = { waitUntil: (p: any) => p, passThroughOnException: () => {} };
    await app.fetch(new Request('http://localhost/api/fakture/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Klijent-ID': kId },
      body: JSON.stringify(invoiceData)
    }), env, mockCtx as any);

    // Webhook: Rejected
    await klijentDO.fetch(new Request('http://do/webhooks/sef-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faktura_id: "LEDGER-2", novi_status: 'Rejected' })
    }));

    const analyticsRes = await klijentDO.fetch(new Request('http://do/api/analytics/potrosnja'));
    const analytics = await analyticsRes.json() as any;

    expect(analytics.saldo).toBe(50);
    expect(analytics.izvod[0].tip_transakcije).toBe('REFUNDACIJA');
  });

  it('Treba da spreči duplu refundaciju (Idempotency Audit)', async () => {
    const kId = 'klijent_ledger_3';
    await env.REGISTAR_DB.prepare("INSERT INTO klijenti (klijent_id, naziv) VALUES (?, ?)")
      .bind(kId, 'Ledger 3').run();
    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(kId);
    const klijentDO = env.KLIJENT_BAZA_OBJECT.get(doId);
    
    await klijentDO.fetch(new Request('http://do/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sef_api_key: 'test_key', limit: 50 })
    }));

    const invoiceData = {
      ID: "LEDGER-3", IssueDate: "2026-05-21", DueDate: "2026-05-30",
      InvoiceTypeCode: "380", DocumentCurrencyCode: "RSD",
      Supplier: { Pib: "123456789", Name: "Test", Address: { City: "BG", CountryCode: "RS" } },
      Customer: { Pib: "987654321", Name: "Kupac", Address: { City: "BG", CountryCode: "RS" } },
      LegalMonetaryTotal: { LineExtensionAmount: 100, TaxExclusiveAmount: 100, TaxInclusiveAmount: 120, AllowanceTotalAmount: 0, PrepaidAmount: 0, PayableRoundingAmount: 0, PayableAmount: 120 },
      Lines: [{ ID: "1", Quantity: 1, UnitCode: "H87", LineExtensionAmount: 100, Price: 100, ItemName: "Usluga", VatCategory: "S", VatPercent: 20 }]
    };

    const mockCtx = { waitUntil: (p: any) => p, passThroughOnException: () => {} };
    await app.fetch(new Request('http://localhost/api/fakture/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Klijent-ID': kId },
      body: JSON.stringify(invoiceData)
    }), env, mockCtx as any);

    // Webhook 1: Rejected
    await klijentDO.fetch(new Request('http://do/webhooks/sef-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faktura_id: "LEDGER-3", novi_status: 'Rejected' })
    }));

    // Webhook 2: Rejected (ponovljen push)
    await klijentDO.fetch(new Request('http://do/webhooks/sef-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faktura_id: "LEDGER-3", novi_status: 'Rejected' })
    }));

    const analyticsRes = await klijentDO.fetch(new Request('http://do/api/analytics/potrosnja'));
    const analytics = await analyticsRes.json() as any;

    expect(analytics.saldo).toBe(50);
    const refunds = analytics.izvod.filter((t: any) => t.tip_transakcije === 'REFUNDACIJA');
    expect(refunds.length).toBe(1);
  });
});
