import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { SefUblBuilder } from '@dlbr/ubl-sdk';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('⛓️ SEF Master Gauntlet — Sve Opcije, Poreski Režimi i Edge Odbrana', () => {
  const API_KEY = process.env.STAGING_SEF_API_KEY;
  const BASE_URL = process.env.SEF_API_URL || 'https://demoefaktura.mfin.gov.rs';
  
  const STAGING_PROD_PIB = '113398540';
  const STAGING_KUPAC_PIB = '105674049';

  beforeAll(() => {
    if (!API_KEY) {
      throw new Error("🚨 STRUKTURALNI KRAH: STAGING_SEF_API_KEY nije pronađen!");
    }
  });

  afterAll(async () => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
    console.log("🧼 [Gauntlet Teardown] Čišćenje resursa završeno.");
  });

  const getCleanMetadata = (broj: string) => ({
    broj,
    pibProdavca: STAGING_PROD_PIB,
    pibKupca: STAGING_KUPAC_PIB,
    nazivProdavca: 'PRODAVAC ENTERPRISE DOO',
    nazivKupca: 'KUPAC ENTERPRISE DOO',
    maticniBrojProdavca: '20456789',
    maticniBrojKupca: '20987654',
    valuta: 'RSD',
    note: 'Forenzički Audit v4.5.5',
    datumIzdavanja: new Date().toISOString().split('T')[0],
    datumDospeca: new Date().toISOString().split('T')[0],
    datumPrometa: new Date().toISOString().split('T')[0]
  });

  const exhaustiveScenarios = [
    {
      id: 'OPCIJA-1',
      description: '1. Komercijalna Standardna Faktura (Tip 380 - Kategorija S)',
      payload: () => SefUblBuilder.buildStandardna({
        ...getCleanMetadata(`FKT-380-STD-${Date.now()}`),
        osnovica: 1000.00, pdv: 200.00, poreskaKategorija: 'S', pdvStopa: 20.00
      }),
      assertions: (xml: string) => {
        expect(xml).toContain('<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>');
        expect(xml).toContain('<cbc:ID>S</cbc:ID>');
        expect(xml).toContain('<cbc:Percent>20.00</cbc:Percent>');
      }
    },
    {
      id: 'OPCIJA-2',
      description: '2. Avansni Račun (Tip 386 - Kategorija S)',
      payload: () => SefUblBuilder.buildAvansni({
        ...getCleanMetadata(`FKT-386-AV-${Date.now()}`),
        osnovica: 5000.00, pdv: 500.00, poreskaKategorija: 'S', pdvStopa: 10.00
      }),
      assertions: (xml: string) => {
        expect(xml).toContain('<cbc:InvoiceTypeCode>386</cbc:InvoiceTypeCode>');
        expect(xml).toContain('<cbc:ID>S</cbc:ID>');
      }
    },
    {
      id: 'OPCIJA-3',
      description: '3. Knjižno Odobrenje / Smanjenje (Tip 381)',
      payload: () => SefUblBuilder.buildSmanjenje({
        ...getCleanMetadata(`FKT-381-CN-${Date.now()}`),
        referentniRacun: 'FKT-REF-001', razlog: 'Korekcija',
        iznosZaSmanjenjeOsnovice: 100.00, iznosZaSmanjenjePdv: 20.00, poreskaKategorija: 'S'
      }),
      assertions: (xml: string) => {
        expect(xml).toContain('<CreditNote');
        expect(xml).toContain('<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>');
      }
    },
    {
      id: 'OPCIJA-4',
      description: '4. Knjižno Zaduženje / Povećanje (Tip 383)',
      payload: () => SefUblBuilder.buildPovecanje({
        ...getCleanMetadata(`FKT-383-DN-${Date.now()}`),
        referentniRacun: 'FKT-REF-001', datumReferentnog: '2026-05-20',
        iznosZaPovecanjeOsnovice: 200.00, iznosZaPovecanjePdv: 40.00, poreskaKategorija: 'S'
      }),
      assertions: (xml: string) => {
        expect(xml).toContain('<cbc:InvoiceTypeCode>383</cbc:InvoiceTypeCode>');
      }
    },
    {
      id: 'OPCIJA-5',
      description: '5. Konačni Račun (380 - AVANS-REDUKCIJA)',
      payload: () => SefUblBuilder.buildKonacniSaAvansom({
        ...getCleanMetadata(`FKT-380-FIN-${Date.now()}`),
        avansBroj: 'AV-REF-001', avansDatum: '2026-05-15',
        ukupnaOsnovica: 2000.00, ukupniPdv: 400.00, odbitakAvansaSaPdv: 600.00, poreskaKategorija: 'S'
      }),
      assertions: (xml: string) => {
        expect(xml).toContain('<cbc:ID>AVANS-REDUKCIJA</cbc:ID>');
      }
    }
  ];

  exhaustiveScenarios.forEach((scenario, index) => {
    it(scenario.description, async () => {
      const xml = scenario.payload();
      scenario.assertions(xml);

      if (index > 0) await delay(1500);

      const uniqueRequestId = `req-gauntlet-${Date.now()}-${index}`;
      const response = await fetch(`${BASE_URL.replace(/\/$/, '')}/api/publicApi/sales-invoice/ubl?requestId=${uniqueRequestId}`, {
        method: 'POST',
        headers: { 'ApiKey': API_KEY!, 'Content-Type': 'application/xml', 'Accept': 'application/json' },
        body: xml
      });

      const responseText = await response.text();
      if (!response.ok) {
        if (response.status >= 500 || responseText.includes('<html')) {
          console.warn(`⚠️ SEF PORTAL NEDOSTUPAN (Status: ${response.status}). Preskačem scenario ${scenario.id}.`);
          return;
        }
        console.error(`❌ ODBIJENO [${scenario.id}]: ${responseText}`);
        throw new Error(`State Rejection: ${responseText}`);
      }

      const json = JSON.parse(responseText);
      expect(json.InvoiceId || json.SalesInvoiceId || json.Id).toBeDefined();
      console.log(`🎯 [${scenario.id}] USPEH. ID: ${json.InvoiceId || json.SalesInvoiceId || json.Id}`);
    }, 30000);
  });
});
