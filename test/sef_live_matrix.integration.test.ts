import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { SefUblBuilder } from '../packages/sef-ubl-builder/src/index';

// 🛡️ POPRAVKA: Ispravan redosled argumenata za setTimeout
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('🎯 SEF Absolute Compliance Matrix — Full 12-Variant Gauntlet', () => {
  const API_KEY = process.env.STAGING_SEF_API_KEY;
  const BASE_URL = process.env.SEF_API_URL || 'https://demoefaktura.mfin.gov.rs';
  
  // v4.3.6: Provereni PIB-ovi za Demo Sandbox
  const TEST_SUPPLIER_PIB = '100000001';
  const TEST_CUSTOMER_PIB = '100000032';

  afterAll(async () => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
    console.log("🧼 [Matrix Teardown] Čišćenje mrežnih resursa završeno.");
  });

  const getBaseData = (broj: string) => ({
    broj,
    pibProdavca: TEST_SUPPLIER_PIB,
    pibKupca: TEST_CUSTOMER_PIB,
    nazivProdavca: 'PRODAVAC DEMO DOO',
    nazivKupca: 'KUPAC DEMO DOO',
    maticniBrojProdavca: '00000000',
    maticniBrojKupca: '00000000',
    valuta: 'RSD',
    note: 'Absolute Compliance v4.3.6'
  });

  const testMatrix = [
    {
      name: '1. Standardna (380)',
      builder: () => SefUblBuilder.buildStandardna({
        ...getBaseData(`MAT-380-STD-${Date.now()}`),
        osnovica: 100.00, pdv: 20.00
      })
    },
    {
      name: '2. Avansna (386)',
      builder: () => SefUblBuilder.buildAvansni({
        ...getBaseData(`MAT-386-AV-${Date.now()}`),
        osnovica: 50.00, pdv: 10.00
      })
    },
    {
      name: '3. Knjižno Odobrenje (381)',
      builder: () => SefUblBuilder.buildSmanjenje({
        ...getBaseData(`MAT-381-CN-${Date.now()}`),
        referentniRacun: 'REF-001', razlog: 'Korekcija',
        iznosZaSmanjenjeOsnovice: 10.00, iznosZaSmanjenjePdv: 2.00
      })
    },
    {
      name: '4. Knjižno Zaduženje (383)',
      builder: () => SefUblBuilder.buildPovecanje({
        ...getBaseData(`MAT-383-DN-${Date.now()}`),
        referentniRacun: 'REF-001', datumReferentnog: '2026-05-20',
        iznosZaPovecanjeOsnovice: 20.00, iznosZaPovecanjePdv: 4.00
      })
    },
    {
      name: '5. Konačna sa Avansom (380)',
      builder: () => SefUblBuilder.buildKonacniSaAvansom({
        ...getBaseData(`MAT-380-FIN-${Date.now()}`),
        avansBroj: 'AV-001', avansDatum: '2026-05-20',
        ukupnaOsnovica: 1000.00, ukupniPdv: 200.00, odbitakAvansaSaPdv: 120.00
      })
    },
    {
      name: '6. Oslobođena (380-E)',
      builder: () => SefUblBuilder.buildOslobodjena({
        ...getBaseData(`MAT-380-EX-${Date.now()}`),
        iznos: 500.00, poreskaKategorija: 'E', sifraOslobodjenja: 'PDV-RS-24-1-1'
      })
    },
    {
      name: '7. Sa Popustom (380)',
      builder: () => SefUblBuilder.buildSaPopustom({
        ...getBaseData(`MAT-380-POP-${Date.now()}`),
        iznosPrePopusta: 200.00, popustIznos: 20.00
      })
    },
    {
      name: '8. Devizna - USD (380)',
      builder: () => SefUblBuilder.buildSaValutom({
        ...getBaseData(`MAT-380-USD-${Date.now()}`),
        valuta: 'USD', kurs: 108.50, kursDatum: '2026-05-22',
        osnovicaRSD: 10850.00, pdvRSD: 2170.00, ukupnoValuta: 120.00
      })
    },
    {
      name: '9. Sa Prilogom (380)',
      builder: () => SefUblBuilder.buildSaPrilogom({
        ...getBaseData(`MAT-380-PRIL-${Date.now()}`),
        ukupno: 120.00, prilogIme: 'test.pdf', prilogBase64: 'JVBERi0xLjQK'
      })
    },
    {
      name: '10. Smanjenje Avansa (381 SrbDtExt)',
      builder: () => SefUblBuilder.buildSmanjenjeAvansa({
        ...getBaseData(`MAT-381-SMAV-${Date.now()}`),
        avansBroj: 'AV-001', avansDatum: '2026-05-20',
        iznosSmanjenjaOsnovice: 100.00, iznosSmanjenjaPdv: 20.00,
        smerDokumenta: 'NEGATIVAN'
      })
    },
    {
      name: '11. Smanjenje u Periodu (381)',
      builder: () => SefUblBuilder.buildSmanjenjeUPeriodu({
        ...getBaseData(`MAT-381-PER-${Date.now()}`),
        periodOd: '2026-01-01', periodDo: '2026-03-31',
        iznosZaSmanjenjeOsnovice: 200.00
      })
    },
    {
      name: '12. Fiskalizacija (380+PFR)',
      builder: () => SefUblBuilder.buildFiskalizacijaProdaja({
        ...getBaseData(`MAT-380-FIS-${Date.now()}`),
        ukupno: 240.00, pfrBrojevi: ['123456-789012-3456']
      })
    }
  ];

  testMatrix.forEach((testCase, index) => {
    it(testCase.name, async () => {
      const xml = testCase.builder();
      expect(xml).toContain('schemeID="9948"');
      
      if (!API_KEY) return;
      if (index > 0) await delay(2000);

      console.log(`📡 [Matrix] Šaljem ${testCase.name}...`);
      const response = await fetch(`${BASE_URL.replace(/\/$/, '')}/api/publicApi/sales-invoice/ubl`, {
        method: 'POST',
        headers: { 'ApiKey': API_KEY, 'Content-Type': 'application/xml', 'Accept': 'application/json' },
        body: xml
      });

      const rawText = await response.text();
      if (!response.ok) {
        console.error(`❌ Odbijanje [${testCase.name}]: ${rawText}`);
      }

      expect([200, 201]).toContain(response.status);
      const json = JSON.parse(rawText);
      expect(json.InvoiceId || json.SalesInvoiceId).toBeDefined();
      console.log(`✅ [${testCase.name}] USPEH. ID: ${json.InvoiceId || json.SalesInvoiceId}`);
    }, 30000);
  });
});
