import { describe, it, expect } from 'vitest';
import { SefUblBuilder } from '../packages/sef-ubl-builder/src/index';
import { SefClient } from '../shared/services/sefClient';

describe('🎯 SEF Happy Path — Živo slanje ispravne fakture na Demo', () => {
  const LIVE_DEMO_API_KEY = process.env.STAGING_SEF_API_KEY;
  // v4.2.8: Koristimo ISKLJUČIVO varijablu iz env-a, bez pametnih nagađanja
  const BASE_URL = process.env.SEF_API_URL || 'https://demoefaktura.mfin.gov.rs';

  it('Slanje 100% ispravnog UBL XML-a i provera registracije na državnom portalu', async () => {
    if (!LIVE_DEMO_API_KEY) {
      console.warn("⚠️ Preskačem test. Nedostaje STAGING_SEF_API_KEY.");
      return;
    }

    const client = new SefClient({
      apiKey: LIVE_DEMO_API_KEY,
      baseUrl: BASE_URL,
      environment: 'sandbox'
    });

    // Generišemo jedinstven broj fakture
    const jedinstveniBroj = `FKT-HAPPY-PATH-${Date.now().toString().slice(-6)}`;

    const validanXml = SefUblBuilder.buildStandardna({
      broj: jedinstveniBroj,
      pibProdavca: '102345678',
      pibKupca: '100000032',
      osnovica: 1000.00,
      pdv: 200.00,
      poreskaKategorija: 'S',
      pdvStopa: 20.00,
      valuta: 'RSD',
      datumIzdavanja: new Date().toISOString().split('T')[0],
      datumDospeca: new Date().toISOString().split('T')[0]
    });

    console.log(`📡 Ispaljujem ispravnu fakturu ${jedinstveniBroj} na državni SEF (preko SefClient)...`);
    console.log("--------------------------------------------------");
    console.log("[GENERISANI UBL XML]:");
    console.log(validanXml);
    console.log("--------------------------------------------------");

    const result = await client.sendInvoice(validanXml, `req-${jedinstveniBroj}`);

    if (!result.success) {
      console.error("❌ SEF je odbio fakturu! Greška:", result.error);
    }

    expect(result.success).toBe(true);
    const invoiceId = result.salesInvoiceId;
    console.log(`✅ Uspeh! Državni ID fakture: ${invoiceId}`);
    
    expect(invoiceId).toBeDefined();
  });
});
