import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, beforeAll, vi, afterAll } from 'vitest';
import { app } from '../worker/index';

describe('v3.7.0 Arhivski Bedem — Uredba o čuvanju e-faktura Audit', () => {

  const klijentId = 'klijent_arhiva_test';
  const pib = '102345678';

  beforeAll(async () => {
    // Inicijalizacija baze
    await env.REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS klijenti (
        klijent_id TEXT PRIMARY KEY, naziv TEXT NOT NULL,
        ima_aktivne_fakture INTEGER DEFAULT 0, poslednji_sync DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(async () => {
    await env.REGISTAR_DB.prepare("DELETE FROM klijenti").run();
    await env.REGISTAR_DB.prepare("INSERT INTO klijenti (klijent_id, naziv) VALUES (?, ?)")
      .bind(klijentId, 'Arhivski Test Firma').run();

    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = env.KLIJENT_BAZA_OBJECT.get(doId);
    
    await klijentDO.fetch(new Request('http://do/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sef_api_key: 'test_key', klijent_id: pib, limit: 100 })
    }));

    await klijentDO.fetch(new Request('http://do/test/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'RESET_LEDGER', saldo: 100 })
    }));
  });

  it('Član 3: Obezbeđivanje integriteta i originalnog UBL XML formata na R2 skladištu', async () => {
    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = env.KLIJENT_BAZA_OBJECT.get(doId);
    const mockCtx = { waitUntil: async (p: any) => await p, passThroughOnException: () => {} };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const urlStr = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url);
      if (urlStr.includes('/sales-invoice/ubl')) {
        return new Response(JSON.stringify({ SalesInvoiceId: 77777, InvoiceNumber: 'FKT-C3-01' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200 });
    });

    const invoiceData = {
      ID: "FKT-C3-01", IssueDate: "2026-05-21", DueDate: "2026-05-30",
      InvoiceTypeCode: "380", DocumentCurrencyCode: "RSD",
      Supplier: { Pib: pib, Name: "Test", Address: { City: "BG", CountryCode: "RS" } },
      Customer: { Pib: "987654321", Name: "Kupac", Address: { City: "NS", CountryCode: "RS" } },
      LegalMonetaryTotal: { LineExtensionAmount: 100, TaxExclusiveAmount: 100, TaxInclusiveAmount: 120, AllowanceTotalAmount: 0, PrepaidAmount: 0, PayableRoundingAmount: 0, PayableAmount: 120 },
      Lines: [{ ID: "1", Quantity: 1, UnitCode: "H87", LineExtensionAmount: 100, Price: 100, ItemName: "Test", VatCategory: "S20", VatPercent: 20 }]
    };

    await app.request('/api/fakture/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Klijent-ID': klijentId },
      body: JSON.stringify(invoiceData)
    }, env, mockCtx as any);

    await new Promise(r => setTimeout(r, 500));

    const r2Objects = await env.SEF_UBL_ARHIVA.list();
    const archivedDoc = r2Objects.objects.find(o => o.key.includes('FKT-C3-01'));
    expect(archivedDoc).toBeDefined();

    fetchSpy.mockRestore();
  });

  it('Član 4: Verifikacija metapodataka o desetogodišnjem zakonskom roku čuvanja', async () => {
    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = env.KLIJENT_BAZA_OBJECT.get(doId);
    const mockCtx = { waitUntil: async (p: any) => await p, passThroughOnException: () => {} };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const urlStr = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url);
      if (urlStr.includes('/sales-invoice/ubl')) {
        return new Response(JSON.stringify({ SalesInvoiceId: 66666, InvoiceNumber: 'FKT-C4-01' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200 });
    });

    const invoiceData = {
      ID: "FKT-C4-01", IssueDate: "2026-05-21", DueDate: "2026-05-30",
      InvoiceTypeCode: "380", DocumentCurrencyCode: "RSD",
      Supplier: { Pib: pib, Name: "Test", Address: { City: "BG", CountryCode: "RS" } },
      Customer: { Pib: "987654321", Name: "Kupac", Address: { City: "NS", CountryCode: "RS" } },
      LegalMonetaryTotal: { LineExtensionAmount: 100, TaxExclusiveAmount: 100, TaxInclusiveAmount: 120, AllowanceTotalAmount: 0, PrepaidAmount: 0, PayableRoundingAmount: 0, PayableAmount: 120 },
      Lines: [{ ID: "1", Quantity: 1, UnitCode: "H87", LineExtensionAmount: 100, Price: 100, ItemName: "Test", VatCategory: "S20", VatPercent: 20 }]
    };

    await app.request('/api/fakture/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Klijent-ID': klijentId },
      body: JSON.stringify(invoiceData)
    }, env, mockCtx as any);

    await new Promise(r => setTimeout(r, 500));

    const r2Objects = await env.SEF_UBL_ARHIVA.list();
    const archivedDoc = r2Objects.objects.find(o => o.key.includes('FKT-C4-01'));
    const head = await env.SEF_UBL_ARHIVA.head(archivedDoc!.key);
    expect(head?.customMetadata?.zakonski_rok_cuvanja).toBe("2036");

    fetchSpy.mockRestore();
  });

  it('Član 5: Uspešno generisanje masovnog audit paketa za poresku inspekciju', async () => {
    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = env.KLIJENT_BAZA_OBJECT.get(doId);
    const mockCtx = { waitUntil: async (p: any) => await p, passThroughOnException: () => {} };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const urlStr = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url);
      if (urlStr.includes('/sales-invoice/ubl')) {
        return new Response(JSON.stringify({ SalesInvoiceId: 55555, InvoiceNumber: 'FKT-C5-01' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200 });
    });

    const invoiceData = {
      ID: "FKT-C5-01", IssueDate: "2026-05-21", DueDate: "2026-05-30",
      InvoiceTypeCode: "380", DocumentCurrencyCode: "RSD",
      Supplier: { Pib: pib, Name: "Test", Address: { City: "BG", CountryCode: "RS" } },
      Customer: { Pib: "987654321", Name: "Kupac", Address: { City: "NS", CountryCode: "RS" } },
      LegalMonetaryTotal: { LineExtensionAmount: 100, TaxExclusiveAmount: 100, TaxInclusiveAmount: 120, AllowanceTotalAmount: 0, PrepaidAmount: 0, PayableRoundingAmount: 0, PayableAmount: 120 },
      Lines: [{ ID: "1", Quantity: 1, UnitCode: "H87", LineExtensionAmount: 100, Price: 100, ItemName: "Test", VatCategory: "S20", VatPercent: 20 }]
    };

    await app.request('/api/fakture/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Klijent-ID': klijentId },
      body: JSON.stringify(invoiceData)
    }, env, mockCtx as any);

    await new Promise(r => setTimeout(r, 500));

    const auditRes = await klijentDO.fetch(new Request('http://do/api/audit/download?period=2026-05-22'));
    const auditData = await auditRes.json() as any;

    expect(auditRes.status).toBe(200);
    expect(auditData.status).toBe("USKLAĐENO_SA_UREDROM_MFIN");
    expect(auditData.ukupnoDokumenata).toBeGreaterThan(0);
    expect(auditData.dokumenti.find((d:any) => d.broj === 'FKT-C5-01')).toBeDefined();

    fetchSpy.mockRestore();
  });
});
