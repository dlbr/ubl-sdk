import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { SefUblBuilder } from '../packages/sef-ubl-builder/src/index';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('🧾 SEF Integracioni Test — Fiskalizovan Promet (380-PFR)', () => {
  const API_KEY = process.env.STAGING_SEF_API_KEY;
  const BASE_URL = process.env.SEF_API_URL || 'https://demoefaktura.mfin.gov.rs';
  
  // Zvanični, aktivni PIB-ovi u državnom SEF Demo registru
  const STAGING_PROD_PIB = '113398540';
  const STAGING_KUPAC_PIB = '105674049';

  beforeAll(() => {
    if (!API_KEY) {
      throw new Error(
        "🚨 STRUKTURALNI KRAH: STAGING_SEF_API_KEY nije pronađen u sistemu! Testiranje je prekinuto radi sprečavanja lažnih prolaza."
      );
    }
  });

  afterAll(async () => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
    console.log("🧼 [Fiskalizacija Teardown] Svi makro-tajmeri i mrežni proksiji su očišćeni.");

    // Brutalna sanacija za Node.js event loop
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  it('Treba uspešno registrovati fiskalizovanu fakturu sa PFR referencama', async () => {
    const brojFakture = `FKT-PFR-${Date.now()}`;
    const pfrBrojevi = [`PFR-${Date.now()}-1`, `PFR-${Date.now()}-2`].slice(0, 2);

    const xml = SefUblBuilder.buildFiskalizacijaProdaja({
      broj: brojFakture,
      pibProdavca: STAGING_PROD_PIB,
      pibKupca: STAGING_KUPAC_PIB,
      nazivProdavca: 'PRODAVAC ENTERPRISE DOO',
      nazivKupca: 'KUPAC ENTERPRISE DOO',
      valuta: 'RSD',
      datumIzdavanja: new Date().toISOString().split('T')[0],
      datumDospeca: new Date().toISOString().split('T')[0],
      datumPrometa: new Date().toISOString().split('T')[0],
      bankovniRacun: '265-0000000000001-01',
      ukupno: 12000.00,
      pfrBrojevi: pfrBrojevi,
      smerDokumenta: 'POZITIVAN'
    });

    // Validacija strukture pre mrežnog slanja
    expect(xml).toContain('<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>');
    pfrBrojevi.forEach(pfr => {
      expect(xml).toContain(`<cbc:Note>Референтни број обрасца: ${pfr}</cbc:Note>`);
    });
    // Odsustvo DescriptionCode anomalije (Task 3)
    expect(xml).not.toContain('<cbc:DescriptionCode>');
    // Prisustvo S20 taga (Task 1)
    expect(xml).toContain('<cbc:ID>S20</cbc:ID>');

    // 🛡️ Jedinstveni requestId za idempotentnost
    const uniqueRequestId = `req-pfr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    console.log(`📡 [MREŽA] Ispaljujem Fiskalizovanu Fakturu (${brojFakture}) sa requestId: ${uniqueRequestId}`);

    const response = await fetch(`${BASE_URL.replace(/\/$/, '')}/api/publicApi/sales-invoice/ubl?requestId=${uniqueRequestId}`, {
      method: 'POST',
      headers: {
        'ApiKey': API_KEY!,
        'Content-Type': 'application/xml',
        'Accept': 'application/json'
      },
      body: xml
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error(`❌ MATRICA PROBIJENA NA FISKALIZACIJI!`);
      console.error(`Sirovi odgovor države: ${responseText}`);
      throw new Error(`Državni SEF je vratio status ${response.status}: ${responseText}`);
    }

    const json = JSON.parse(responseText);
    const stvarniDrzavniId = json.InvoiceId || json.SalesInvoiceId || json.Id;

    expect(stvarniDrzavniId).toBeDefined();
    console.log(`🎯 [FISKALIZACIJA] VERIFIKOVANO NA DRŽAVI. Registrovani ID: ${stvarniDrzavniId}`);
  }, 15000);
});
