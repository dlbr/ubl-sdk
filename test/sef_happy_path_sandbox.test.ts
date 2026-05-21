// test/sef_happy_path_sandbox.test.ts
import { describe, it, expect } from 'vitest';
import { SefUblBuilder } from '../packages/sef-ubl-builder/src/index';

/**
 * SEF Happy Path Test
 * 
 * Ovaj test ispaljuje STVARNU, VALIDNU fakturu na državni Sandbox.
 * Ako test prođe, faktura će biti vidljiva na https://demoefaktura.mfin.gov.rs/
 */
describe('🎯 SEF Happy Path — Live Sandbox Delivery', () => {
  const API_KEY = process.env.STAGING_SEF_API_KEY;
  
  // Ovi PIB-ovi moraju biti validni i registrovani na demosef portalu
  const PIBs = {
    prodavac: '102345678', // Zamenite sa vašim testnim PIB-om ako je drugačiji
    kupac: '100000032'    // Standardni testni PIB kupca za sandbox
  };

  it('Treba uspešno poslati fakturu i dobiti državni SalesInvoiceId', async () => {
    if (!API_KEY) {
      console.warn("⚠️ Preskačem test: STAGING_SEF_API_KEY nije podešen.");
      return;
    }

    // Generišemo unikatan broj fakture za ovaj pokušaj (da izbegnemo "Duplicate ID" grešku)
    const brojFakture = `HAPPY-PATH-${Date.now().toString().slice(-6)}`;

    // 1. Gradimo savršen XML prema Master Specifikaciji (April 2026)
    const validanXml = SefUblBuilder.buildStandardna({
      broj: brojFakture,
      pibProdavca: PIBs.prodavac,
      pibKupca: PIBs.kupac,
      osnovica: 1000.00,
      pdv: 200.00,
      poreskaKategorija: 'S',
      pdvStopa: 20.00
    });

    console.log(`📡 Šaljem fakturu ${brojFakture} na demosef.mfin.gov.rs...`);

    // 2. Ispaljujemo zahtev ka državi
    const response = await fetch('https://demosef.mfin.gov.rs/api/publicApi/sales-invoice/ubl', {
      method: 'POST',
      headers: {
        'ApiKey': API_KEY,
        'Content-Type': 'application/xml',
        'Accept': 'application/json'
      },
      body: validanXml
    });

    const body = await response.text();
    
    if (!response.ok) {
      console.error("❌ Država odbila fakturu:", body);
      throw new Error(`SEF_REJECTED: ${body}`);
    }

    const result = JSON.parse(body);
    console.log(`✅ USPEH! Faktura je primljena.`);
    console.log(`--------------------------------------------------`);
    console.log(`Broj fakture: ${brojFakture}`);
    console.log(`Državni ID (SalesInvoiceId): ${result.SalesInvoiceId}`);
    console.log(`Državni Hash: ${result.PurchaseInvoiceHash}`);
    console.log(`--------------------------------------------------`);
    console.log(`👉 Proveri je odmah na: https://demoefaktura.mfin.gov.rs/`);

    expect(response.status).toBe(200);
    expect(result.SalesInvoiceId).toBeDefined();
  });
});
