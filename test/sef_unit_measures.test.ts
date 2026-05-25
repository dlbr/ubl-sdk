// test/sef_unit_measures.test.ts
import { describe, it, expect } from 'vitest';
import { SefClient } from '@sef/shared/services/sefClient';

describe('📏 SEF Metadata — Live Unit Measures Testing', () => {
  const API_KEY = process.env.STAGING_SEF_API_KEY;
  const BASE_URL = process.env.SEF_API_URL || 'https://demoefaktura.mfin.gov.rs';

  it('Treba uspešno povući šifrarnik jedinica mera sa državnog SEF-a', async () => {
    if (!API_KEY) {
      console.warn("⚠️ Preskačem test: STAGING_SEF_API_KEY nije podešen.");
      return;
    }

    const client = new SefClient({
      apiKey: API_KEY,
      baseUrl: BASE_URL,
      environment: 'sandbox'
    });

    console.log(`📡 Povlačim jedinice mera sa: ${BASE_URL}/api/publicApi/get-unit-measures`);

    const mere = await client.getUnitMeasures();

    if (!mere) {
      console.error("❌ Državni API nije vratio jedinice mera.");
      throw new Error("FAILED_TO_FETCH_UNIT_MEASURES");
    }

    console.log(`✅ Uspeh! Preuzeto ${mere.length} jedinica mera.`);
    console.log(`Primeri: ${mere.slice(0, 5).join(', ')}...`);

    expect(Array.isArray(mere)).toBe(true);
    expect(mere.length).toBeGreaterThan(0);
    
    // Provera mandatornih kodova (H87 je 'komad', najčešći kod na SEF-u)
    expect(mere).toContain('H87');
  });
});
