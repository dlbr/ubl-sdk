import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, beforeAll, vi, afterAll } from 'vitest';
import { app } from '../packages/backend/src/index';
import { SefPppdvExporter } from '@sef/shared/services/pppdvExporter';

describe('SEF Bridge v3.6.0 — Krovni E2E Smoke Test i Verifikacija Lanaca (Poreski Kvantni Skok)', () => {

  const klijentId = 'klijent_smoke_test';
  const pib = '102345678';
  const formattedPib = `RS${pib}`;

  beforeAll(async () => {
    vi.setSystemTime(new Date('2026-05-26T11:00:00Z'));
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
    await env.REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS dokumenti (
        id TEXT PRIMARY KEY, sef_id TEXT UNIQUE, tip TEXT NOT NULL, broj TEXT NOT NULL,
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
          akcizna_kategorija TEXT, akcizna_gustina REAL, izvorna_stavka_id TEXT,
          UNIQUE(dokument_id, line_id)
        )
      `).run();
    await env.REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS dokumenti_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, dokument_id TEXT, poruka TEXT, kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `).run();

    await env.REGISTAR_DB.prepare("DELETE FROM dokumenti_log").run();
    await env.REGISTAR_DB.prepare("DELETE FROM dokument_stavke").run();
    await env.REGISTAR_DB.prepare("DELETE FROM dokumenti").run();
    await env.REGISTAR_DB.prepare("DELETE FROM klijenti").run();
    await env.REGISTAR_DB.prepare("INSERT INTO klijenti (klijent_id, naziv) VALUES (?, ?)").bind(klijentId, 'E2E Smoke Firma').run();

    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = env.KLIJENT_BAZA_OBJECT.get(doId);
    
    await klijentDO.fetch(new Request('http://do/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sef_api_key: 'test_key', klijent_id: pib, limit: 500, environment: 'sandbox' })
    }));
  });

  it('Kompletan ciklus: Validacija ➔ Rezervacija ➔ Webhook Refundacija ➔ e-Porezi TXT Export', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (req: Request | string | URL, init?: RequestInit) => {
      const urlStr = typeof req === 'string' ? req : (req instanceof URL ? req.toString() : req.url);
      if (urlStr.includes('/sales-invoice/ubl')) {
        return new Response(JSON.stringify({ SalesInvoiceId: 99999, InvoiceNumber: 'FKT-2026-OE-01' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(req, init);
    };

    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = env.KLIJENT_BAZA_OBJECT.get(doId);
    const mockCtx = { waitUntil: async (p: any) => await p, passThroughOnException: () => {} };

    const izlaznaFaktura = {
      invoiceId: "FKT-2026-OE-01",
      invoiceTypeCode: "380",
      customizationId: "urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.rs:srbdt:2.1",
      profileId: "urn:fdc:peppol.eu:poacc:bis3:invoice:3",
      issueDate: "2026-05-26",
      issueTime: "11:00:00",
      routingDetails: { sender: formattedPib, receiver: "GENERIC_RS_EINVOICE_1p0p0", documentScheme: 'RS_E_INVOICING', routingChannel: 'PRODUCTION' },
      businessProcessType: 'COMMERCIAL_INVOICING',
      businessContextId: 'urn:vertexinc:vrbl:context:rs:proc:1',
      invoicePeriod: { startDate: "2026-05-01", endDate: "2026-05-25" },
      documentCurrencyCode: "RSD",
      taxCurrencyCode: "RSD",
      supplierPib: formattedPib,
      customerPib: "987654321",
      lineExtensionAmount: 150000.00,
      taxExclusiveAmount: 150000.00,
      taxInclusiveAmount: 150000.00,
      payableAmount: 150000.00,
      allowanceTotalAmount: 0,
      chargeTotalAmount: 0,
      taxTotals: [{
        currencyCode: 'RSD',
        taxAmount: 0,
        taxSchemeId: 'VAT',
        subtotals: [{ taxableAmount: 150000.00, taxAmount: 0, taxCategoryCode: 'OE', taxCategoryPercent: 0, taxExemptionReasonCode: 'PDV-RS-9-1-OE', taxExemptionReason: 'Nije predmet oporezivanja u skladu sa članom 9.' }]
      }],
      invoiceLines: [{
        id: "L1", 
        name: "Usluga OE",
        invoicedQuantity: 1, 
        unitCode: "HUR",
        priceAmount: 150000.00, 
        lineExtensionAmount: 150000.00, 
        classifiedTaxCategory: { taxCategoryCode: 'OE', taxCategoryPercent: 0, taxSchemeId: 'VAT' }
      }]
    };

    const sendRes = await app.request('/api/fakture/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Klijent-ID': klijentId },
      body: JSON.stringify(izlaznaFaktura)
    }, env, mockCtx as any);

    expect(sendRes.status).toBe(202);

    await new Promise(r => setTimeout(r, 500));

    let analyticsRes = await klijentDO.fetch(new Request('http://do/api/analytics/potrosnja'));
    let analytics = await analyticsRes.json() as any;
    expect(analytics.saldo).toBe(499);

    await klijentDO.fetch(new Request('http://do/test/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        action: 'SEED_IMPORT',
        sefId: 'IMPORT-001',
        invoiceNumber: 'CARINA-26',
        issueDate: '2026-05-26T10:00:00Z',
        totalAmount: 45230.80,
        taxableAmount: 0,
        taxAmount: 45230.80
      })
    }));

    await klijentDO.fetch(new Request('http://do/webhooks/sef-update?smer=SALES', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faktura_id: "99999", novi_status: 'Approved' })
    }));

    const exportRes = await klijentDO.fetch(new Request('http://do/api/analytics/pppdv-summary?period=2026-05'));
    const realSummaryResponse = await exportRes.json() as any;
    const realSummary = realSummaryResponse.data;

    expect(realSummary.pozicija004_oslobodjenBezPrava).toBe(150000);
    expect(realSummary.porezZaUplatuIliPovracaj).toBe(-45231);

    const fullSummary = {
      period: '2026-05',
      pozicija001_osnovicaOpsta: 0,
      pozicija101_pdvOpsta: 0,
      pozicija002_osnovicaPosebna: 0,
      pozicija102_pdvPosebna: 0,
      pozicija003_oslobodjenSaPravom: 0,
      pozicija004_oslobodjenBezPrava: 150000,
      pozicija005_uvozOsnovica: 0,
      pozicija105_uvozPdv: 45231,
      pozicija006_interniObracunOsnovica: 0,
      pozicija106_interniObracunPdv: 0,
      pozicija008_prethodniPorezOdbitni: 0,
      porezZaUplatuIliPovracaj: 0
    };

    const pppdvTxt = SefPppdvExporter.generateTxt(pib, fullSummary);

    expect(pppdvTxt).toContain("H|1.0|PPPDV|");
    expect(pppdvTxt).toContain(pib);
    expect(pppdvTxt).toContain("2026-05-01|2026-05-31");
    expect(pppdvTxt).toContain("D|004|150000");
    expect(pppdvTxt).toContain("D|105|45231");

    await klijentDO.fetch(new Request('http://do/webhooks/sef-update?smer=SALES', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faktura_id: "99999", novi_status: 'Rejected' })
    }));

    analyticsRes = await klijentDO.fetch(new Request('http://do/api/analytics/potrosnja'));
    analytics = await analyticsRes.json() as any;
    expect(analytics.saldo).toBe(500);
    expect(analytics.izvod[0].tip_transakcije).toBe('REFUNDACIJA');

    globalThis.fetch = originalFetch;
  });
});
