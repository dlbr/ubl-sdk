import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { SefInvoiceData } from '../shared/types/sef';

describe('KlijentBaza: SEF E2E Integration', () => {
  const klijentId = 'klijent_test_pib';
  const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);
  const klijentDO = env.KLIJENT_BAZA_OBJECT.get(doId);

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
      Supplier: { Pib: '123456789', Name: 'Supplier', Address: { City: 'Beograd', CountryCode: 'RS' } },
      Customer: { Pib: '987654321', Name: 'Customer', Address: { City: 'Novi Sad', CountryCode: 'RS' } },
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
      Supplier: { Pib: '123456789', Name: 'Supplier', Address: { City: 'Beograd', CountryCode: 'RS' } },
      Customer: { Pib: '987654321', Name: 'Customer', Address: { City: 'Novi Sad', CountryCode: 'RS' } },
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
      Supplier: { Pib: '123456789', Name: 'Supplier', Address: { City: 'BG', CountryCode: 'RS' } },
      Customer: { Pib: '987654321', Name: 'Customer', Address: { City: 'NS', CountryCode: 'RS' } },
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
