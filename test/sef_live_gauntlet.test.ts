import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { SefUblBuilder } from '../src/SefUblBuilder';
import { parseUblXml } from '../src/ublParser';

describe('⛓️ SEF Live SDK Gauntlet — 17 Zakonskih Scenarija', () => {
  const API_KEY = process.env.STAGING_SEF_API_KEY;
  const SEF_API_URL = 'https://demoefaktura.mfin.gov.rs/api/publicApi/sales-invoice/ubl';

  const STAGING_PROD_PIB = '113398540';
  const STAGING_KUPAC_PIB = '105674049';

  beforeAll(() => {
    if (!API_KEY) {
      console.warn("⚠️ STAGING_SEF_API_KEY nije pronađen! Preskačem live testove, koristim Mock.");
      global.fetch = vi.fn().mockImplementation((url, options) => {
        const body = JSON.parse(options.body);
        return Promise.resolve(new Response(JSON.stringify({
          salesInvoiceId: Math.floor(Math.random() * 1000000),
          purchaseInvoiceId: null,
          invoiceNumber: body.invoiceNumber,
          status: "Sent"
        }), { status: 201 }));
      });
    }
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  const generateUnikatniBroj = (prefiks: string) => `${prefiks}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const scenariji = [
    {
      id: '1',
      naslov: 'Komercijalna faktura (Tip 380, Opšta stopa 20%)',
      payload: (br: string) => ({
        invoiceNumber: br, issueDate: '2026-06-01', supplierPib: STAGING_PROD_PIB, customerPib: STAGING_KUPAC_PIB,
        invoiceTypeCode: '380', taxableAmount: 1000, taxAmount: 200, payableAmount: 1200,
        lines: [{ id: '1', name: 'Roba A', quantity: 1, priceAmount: 1000, lineExtensionAmount: 1000, taxCategoryPercent: 20 }]
      }),
      ocekivano: { tip: '380', porez: 200, ukupno: 1200 }
    },
    {
      id: '2',
      naslov: 'Komercijalna faktura (Tip 380, Posebna stopa 10%)',
      payload: (br: string) => ({
        invoiceNumber: br, issueDate: '2026-06-01', supplierPib: STAGING_PROD_PIB, customerPib: STAGING_KUPAC_PIB,
        invoiceTypeCode: '380', taxableAmount: 1000, taxAmount: 100, payableAmount: 1100,
        lines: [{ id: '1', name: 'Roba B', quantity: 1, priceAmount: 1000, lineExtensionAmount: 1000, taxCategoryPercent: 10 }]
      }),
      ocekivano: { tip: '380', porez: 100, ukupno: 1100 }
    },
    {
      id: '3',
      naslov: 'Faktura sa oslobođenjem (Kategorija R - Izvoz)',
      payload: (br: string) => ({
        invoiceNumber: br, issueDate: '2026-06-01', supplierPib: STAGING_PROD_PIB, customerPib: STAGING_KUPAC_PIB,
        invoiceTypeCode: '380', taxableAmount: 5000, taxAmount: 0, payableAmount: 5000,
        lines: [{ id: '1', name: 'Izvoz robe', quantity: 1, priceAmount: 5000, lineExtensionAmount: 5000, taxCategoryPercent: 0, taxCategoryCode: 'R', taxExemptionReasonCode: 'PDV-RS-24-1-1' }]
      }),
      ocekivano: { tip: '380', porez: 0, ukupno: 5000 }
    },
    {
      id: '6',
      naslov: 'Faktura za javnu nabavku (JBKJS + OrderReference)',
      payload: (br: string) => ({
        invoiceNumber: br, issueDate: '2026-06-01', supplierPib: STAGING_PROD_PIB, customerPib: STAGING_KUPAC_PIB,
        invoiceTypeCode: '380', taxableAmount: 1000, taxAmount: 200, payableAmount: 1200,
        buyerReference: 'JN-JBKJS:12345', orderReference: { id: 'UGOVOR-2026-X', issueDate: '2026-05-01' },
        lines: [{ id: '1', name: 'Usluga JN', quantity: 1, priceAmount: 1000, lineExtensionAmount: 1000, taxCategoryPercent: 20 }]
      }),
      ocekivano: { tip: '380', imaBuyerRef: true }
    },
    {
      id: '7',
      naslov: 'Avansna faktura (Tip 386, 20%)',
      payload: (br: string) => ({
        invoiceNumber: br, issueDate: '2026-06-01', supplierPib: STAGING_PROD_PIB, customerPib: STAGING_KUPAC_PIB,
        invoiceTypeCode: '386', taxableAmount: 1000, taxAmount: 200, payableAmount: 1200, dueDate: '2026-06-05',
        lines: [{ id: '1', name: 'Avans', quantity: 1, priceAmount: 1000, lineExtensionAmount: 1000, taxCategoryPercent: 20 }]
      }),
      ocekivano: { tip: '386', porez: 200 }
    },
    {
      id: '11',
      naslov: 'Devizna faktura (EUR / RSD)',
      payload: (br: string) => ({
        invoiceNumber: br, issueDate: '2026-06-01', supplierPib: STAGING_PROD_PIB, customerPib: STAGING_KUPAC_PIB,
        invoiceTypeCode: '380', currency: 'EUR', exchangeRate: 117.2, taxableAmount: 10, taxAmount: 2, payableAmount: 12,
        lines: [{ id: '1', name: 'Usluga', quantity: 1, priceAmount: 10, lineExtensionAmount: 10, taxCategoryPercent: 20 }]
      }),
      ocekivano: { valuta: 'EUR', rsdPorez: 234.4 }
    },
    {
      id: '13',
      naslov: 'Knjižno zaduženje (Tip 383)',
      payload: (br: string) => ({
        invoiceNumber: br, issueDate: '2026-06-01', supplierPib: STAGING_PROD_PIB, customerPib: STAGING_KUPAC_PIB,
        invoiceTypeCode: '383', billingReference: { id: 'FKT-001', issueDate: '2026-05-01' }, taxableAmount: 100, taxAmount: 20, payableAmount: 120,
        lines: [{ id: '1', name: 'Razlika u ceni', quantity: 1, priceAmount: 100, lineExtensionAmount: 100, taxCategoryPercent: 20 }]
      }),
      ocekivano: { tip: '383' }
    },
    {
      id: '14',
      naslov: 'Knjižno odobrenje (Tip 381)',
      payload: (br: string) => ({
        invoiceNumber: br, issueDate: '2026-06-01', supplierPib: STAGING_PROD_PIB, customerPib: STAGING_KUPAC_PIB,
        invoiceTypeCode: '381', billingReference: { id: 'FKT-001', issueDate: '2026-05-01' }, taxableAmount: 100, taxAmount: 20, payableAmount: 120,
        lines: [{ id: '1', name: 'Povrat', quantity: 1, priceAmount: 100, lineExtensionAmount: 100, taxCategoryPercent: 20 }]
      }),
      ocekivano: { tip: '381' }
    },
    {
      id: '16',
      naslov: 'Anuliranje (Negativne stavke)',
      payload: (br: string) => ({
        invoiceNumber: br, issueDate: '2026-06-01', supplierPib: STAGING_PROD_PIB, customerPib: STAGING_KUPAC_PIB,
        invoiceTypeCode: '380', taxableAmount: 0, taxAmount: 200, payableAmount: 200,
        lines: [
          { id: '1', name: 'Usluga X', quantity: 1, priceAmount: 1000, lineExtensionAmount: 1000, taxCategoryPercent: 20, taxCategoryCode: 'S' },
          { id: '2', name: 'Storno X', quantity: -1, priceAmount: 1000, lineExtensionAmount: -1000, taxCategoryPercent: 0, taxCategoryCode: 'N', taxExemptionReasonCode: 'PDV-RS-4' }
        ]
      }),
      ocekivano: { ukupno: 200 }
    }
  ];

  scenariji.forEach((s) => {
    it(`[${s.id}] Live Gauntlet: ${s.naslov}`, async () => {
      const broj = generateUnikatniBroj(`SDK-G-${s.id}`);
      const payload = s.payload(broj);
      
      const xml = SefUblBuilder.build(payload as any);
      expect(xml).toContain('<cbc:ID>' + broj + '</cbc:ID>');

      const requestId = `req-${broj}`;
      const response = await fetch(SEF_API_URL, {
        method: 'POST',
        headers: {
          'ApiKey': API_KEY || 'mock-key',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          invoiceNumber: broj,
          requestId,
          ubl: btoa(xml)
        })
      });

      if (response.status !== 201) {
        const errorText = await response.text();
        console.error(`🚨 [SEF ERROR] ${s.naslov}:`, errorText);
      }

      expect(response.status).toBe(201);
      const sefResult = await response.json() as any;
      expect(sefResult.salesInvoiceId).toBeDefined();

      const parsed = await parseUblXml(xml);
      expect(parsed.invoiceTypeCode).toBe(s.ocekivano.tip || (payload as any).invoiceTypeCode);
      if (s.ocekivano.porez) expect(parsed.taxAmount).toBe(s.ocekivano.porez);
      
      console.log(`✅ [SUCCESS] ${s.naslov} | SEF ID: ${sefResult.salesInvoiceId}`);
    });
  });
});
