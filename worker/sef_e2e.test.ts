import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SefInvoiceData } from '../shared/types/sef';

describe('KlijentBaza: SEF E2E Integration', () => {
  const klijentId = 'klijent_test_pib';
  const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);
  const klijentDO = env.KLIJENT_BAZA_OBJECT.get(doId);

  beforeEach(async () => {
    vi.restoreAllMocks();
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
    
    // Clear error logs and fakture if possible or use unique IDs
    // Note: SQLite state in DO might persist between tests depending on setup
    // We'll use unique IDs to be safe.
  });

  it('1. Happy Path - Success on first attempt', async () => {
    const invoiceId = `INV-${Date.now()}`;
    const mockSefResponse = { SalesInvoiceId: 1001, InvoiceNumber: invoiceId };
    
    const globalFetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (typeof input === 'string' && input.includes('/sales-invoice/ubl')) {
        return new Response(JSON.stringify(mockSefResponse), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });

    const invoiceData: any = {
      ID: invoiceId,
      InvoiceTypeCode: "380",
      IssueDate: "2026-05-20",
      DueDate: "2026-06-03",
      DocumentCurrencyCode: "RSD",
      Supplier: { 
        Pib: '123456789', 
        Name: 'Supplier Name', 
        Address: { City: 'Beograd', CountryCode: 'RS' } 
      },
      Customer: { 
        Pib: '987654321', 
        Name: 'Customer Name', 
        Address: { City: 'Novi Sad', CountryCode: 'RS' } 
      },
      TaxTotals: [{
        TaxAmount: 20,
        Subtotals: [{
          TaxableAmount: 100,
          TaxAmount: 20,
          Category: 'S',
          Percent: 20
        }]
      }],
      LegalMonetaryTotal: { 
        LineExtensionAmount: 100, 
        TaxExclusiveAmount: 100, 
        TaxInclusiveAmount: 120, 
        AllowanceTotalAmount: 0,
        PrepaidAmount: 0,
        PayableRoundingAmount: 0,
        PayableAmount: 120 
      },
      Lines: [{
        ID: "1",
        Quantity: 1,
        UnitCode: "H87",
        LineExtensionAmount: 100,
        Price: 100,
        ItemName: "Test Item",
        VatCategory: "S",
        VatPercent: 20
      }]
    };


    const res = await klijentDO.fetch(new Request('http://do/fakture/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invoiceData)
    }));

    const body = await res.json() as any;
    expect(res.status).toBe(202);
    expect(body.success).toBe(true);

    // Polling za status jer je sada asinhrono
    let attempts = 0;
    let finalStatus = 'Queued';
    while (attempts < 10) {
      const statsRes = await klijentDO.fetch(new Request('http://do/stats'));
      const stats = await statsRes.json() as any;
      const sentStat = stats.stats.find((s: any) => s.status === 'Sent');
      if (sentStat && sentStat.broj > 0) {
        finalStatus = 'Sent';
        break;
      }
      const failStat = stats.stats.find((s: any) => s.status === 'Failed');
      if (failStat && failStat.broj > 0) {
        finalStatus = 'Failed';
        break;
      }
      await new Promise(r => setTimeout(r, 200));
      attempts++;
    }

    expect(finalStatus).toBe('Sent');
    expect(globalFetchMock).toHaveBeenCalledTimes(1);
  });

  it('2. Ecosystem Recovery - Success after 2 retries', async () => {
    const invoiceId = `INV-RETRY-${Date.now()}`;
    let fetchCount = 0;

    const globalFetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (typeof input === 'string' && input.includes('/sales-invoice/ubl')) {
        fetchCount++;
        if (fetchCount < 3) {
          return new Response('SEF Down', { status: 503 });
        }
        return new Response(JSON.stringify({ SalesInvoiceId: 2002, InvoiceNumber: invoiceId }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });

    const invoiceData: any = {
      ID: invoiceId,
      InvoiceTypeCode: "380",
      IssueDate: "2026-05-20",
      DueDate: "2026-06-03",
      DocumentCurrencyCode: "RSD",
      Supplier: { 
        Pib: '123456789', 
        Name: 'Supplier Name', 
        Address: { City: 'Beograd', CountryCode: 'RS' } 
      },
      Customer: { 
        Pib: '987654321', 
        Name: 'Customer Name', 
        Address: { City: 'Novi Sad', CountryCode: 'RS' } 
      },
      TaxTotals: [{
        TaxAmount: 20,
        Subtotals: [{
          TaxableAmount: 100,
          TaxAmount: 20,
          Category: 'S',
          Percent: 20
        }]
      }],
      LegalMonetaryTotal: { 
        LineExtensionAmount: 100, 
        TaxExclusiveAmount: 100, 
        TaxInclusiveAmount: 120, 
        AllowanceTotalAmount: 0,
        PrepaidAmount: 0,
        PayableRoundingAmount: 0,
        PayableAmount: 120 
      },
      Lines: [{
        ID: "1",
        Quantity: 1,
        UnitCode: "H87",
        LineExtensionAmount: 100,
        Price: 100,
        ItemName: "Test Item",
        VatCategory: "S",
        VatPercent: 20
      }]
    };

    const res = await klijentDO.fetch(new Request('http://do/fakture/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invoiceData)
    }));
    
    const body = await res.json() as any;
    expect(res.status).toBe(202);
    expect(body.success).toBe(true);

    // Polling za status
    let attempts = 0;
    let finalStatus = 'Queued';
    while (attempts < 20) {
      const statsRes = await klijentDO.fetch(new Request('http://do/stats'));
      const stats = await statsRes.json() as any;
      const invoiceStats = stats.stats;
      const currentStatus = invoiceStats.find((s: any) => s.broj > 0)?.status || 'None';
      
      console.log(`[Test] Attempt ${attempts}: Status=${currentStatus}, FetchCount=${fetchCount}`);

      if (currentStatus === 'Sent') {
        finalStatus = 'Sent';
        break;
      }

      // Guramo ručno jer se u testu alarm možda ne okida
      await klijentDO.fetch(new Request('http://do/sync-sef', { method: 'POST' }));

      await new Promise(r => setTimeout(r, 500));
      attempts++;
    }

    expect(finalStatus).toBe('Sent');
    expect(fetchCount).toBe(3);
  }, 30000);

  it('3. Limit Enforcement - Blocking when monthly quota reached', async () => {
    // Set zero limit
    await klijentDO.fetch(new Request('http://do/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 0, plan: 'Micro' }) // 0 limit means no more invoices
    }));

    const invoiceData: any = {
      ID: "INV-LIMIT-TEST",
      InvoiceTypeCode: "380",
      IssueDate: "2026-05-20",
      DueDate: "2026-06-03",
      DocumentCurrencyCode: "RSD",
      Supplier: { 
        Pib: '123456789', 
        Name: 'Supplier Name', 
        Address: { City: 'Beograd', CountryCode: 'RS' } 
      },
      Customer: { 
        Pib: '987654321', 
        Name: 'Customer Name', 
        Address: { City: 'Novi Sad', CountryCode: 'RS' } 
      },
      TaxTotals: [{
        TaxAmount: 20,
        Subtotals: [{
          TaxableAmount: 100,
          TaxAmount: 20,
          Category: 'S',
          Percent: 20
        }]
      }],
      LegalMonetaryTotal: { 
        LineExtensionAmount: 100, 
        TaxExclusiveAmount: 100, 
        TaxInclusiveAmount: 120, 
        AllowanceTotalAmount: 0,
        PrepaidAmount: 0,
        PayableRoundingAmount: 0,
        PayableAmount: 120 
      },
      Lines: [{
        ID: "1",
        Quantity: 1,
        UnitCode: "H87",
        LineExtensionAmount: 100,
        Price: 100,
        ItemName: "Test Item",
        VatCategory: "S",
        VatPercent: 20
      }]
    };

    const res = await klijentDO.fetch(new Request('http://do/fakture/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invoiceData)
    }));

    expect(res.status).toBe(402);
    const body = await res.json() as any;
    expect(body.error).toBe("Limit paketa je pređen");
  });
});
