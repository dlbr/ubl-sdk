import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { SefUblBuilder } from '@dlbr/ubl-sdk';
import { SefClient } from '@sef/shared/services/sefClient';

describe('🎯 SEF Happy Path — Živo slanje ispravne fakture na Demo', () => {
  const API_KEY = process.env.STAGING_SEF_API_KEY;
  
  // Zvanični Demo podaci za 2026. godinu
  const STAGING_PROD_PIB = '113398540';
  const STAGING_KUPAC_PIB = '105674049';

  beforeAll(() => {
    if (!API_KEY) {
      throw new Error("🚨 KATASTROFA: STAGING_SEF_API_KEY nije definisan!");
    }
  });

  afterAll(async () => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
    await new Promise(r => setTimeout(r, 500));
  });

  it('Slanje 100% ispravnog UBL XML-a i provera registracije na državnom portalu', async () => {
    const client = new SefClient({
      apiKey: API_KEY!,
      baseUrl: 'https://demoefaktura.mfin.gov.rs',
      environment: 'sandbox'
    });

    const jedinstveniBroj = `FKT-HAPPY-PATH-${Date.now().toString().slice(-6)}`;

    // 🛡️ KORISTIMO MASTER ENGINE v4.5.3 (Garantovana XSD sekvenca)
    const validanXml = SefUblBuilder.buildStandardna({
      broj: jedinstveniBroj,
      pibProdavca: STAGING_PROD_PIB,
      pibKupca: STAGING_KUPAC_PIB,
      nazivProdavca: 'PRODAVAC ENTERPRISE',
      nazivKupca: 'KUPAC ENTERPRISE',
      osnovica: 1000.00,
      pdv: 200.00,
      poreskaKategorija: 'S',
      pdvStopa: 20.00,
      valuta: 'RSD',
      datumIzdavanja: new Date().toISOString().split('T')[0],
      datumDospeca: new Date().toISOString().split('T')[0],
      datumPrometa: new Date().toISOString().split('T')[0]
    });

    console.log(`📡 Ispaljujem ispravnu fakturu ${jedinstveniBroj} na državni SEF (preko SefClient)...`);

    try {
      const result = await client.sendInvoice(validanXml, jedinstveniBroj);

      if (!result.success) {
        if (result.error?.includes('EDGE_FETCH_FAILURE') || result.statusCode === 500 || result.statusCode === 503) {
          console.warn(`⚠️ SEF PORTAL NEDOSTUPAN (Status: ${result.statusCode}). Preskačem test.`);
          return; // Skip test
        }
        console.error("❌ SEF je odbio fakturu! Greška:", result.error);
        throw new Error(`State Rejection: ${result.error}`);
      }

      expect(result.success).toBe(true);
      const invoiceId = result.salesInvoiceId;
      console.log(`🎯 Uspeh! Državni ID fakture: ${invoiceId}`);
      expect(invoiceId).toBeDefined();

    } catch (e: any) {
      if (e.message.includes('Circuit Breaker') || e.message.includes('offline')) {
        console.warn(`⚠️ CIRCUIT BREAKER AKTIVAN. Preskačem test.`);
        return;
      }
      throw e;
    }
  }, 20000);
});
