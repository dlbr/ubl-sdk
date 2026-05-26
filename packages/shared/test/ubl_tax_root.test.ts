import { describe, it, expect } from 'vitest';
import { safeParse } from 'valibot';
import { TaxTotalSchema } from '../src/validators/ubl';

describe('🛡️ Vertex Tax Root Restrikcije [VRBL-CALC-50 / 55]', () => {

  it('✅ 1. Prolaz za ispravno konfigurisan krovni TaxTotal blok sa VAT shemom', () => {
    const validanTaxRoot = {
      currencyCode: 'RSD',
      taxAmount: 2000.00,
      taxSchemeId: 'VAT',
      subtotals: [
        {
          taxableAmount: 10000.00,
          taxCategoryPercent: 20.00,
          taxAmount: 2000.00,
          taxCategoryCode: 'S'
        }
      ]
    };

    const res = safeParse(TaxTotalSchema, validanTaxRoot);
    expect(res.success).toBe(true);
  });

  it('🛑 2. Odbij ako je krovna poreska shema pogrešna (npr. TAX umesto VAT)', () => {
    const losaShema = {
      currencyCode: 'RSD',
      taxAmount: 2000.00,
      taxSchemeId: 'TAX',
      subtotals: [
        {
          taxableAmount: 10000.00,
          taxCategoryPercent: 20.00,
          taxAmount: 2000.00,
          taxCategoryCode: 'S'
        }
      ]
    };

    const res = safeParse(TaxTotalSchema, losaShema);
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('Krovna poreska shema (TaxScheme ID) mora biti postavljena na "VAT"');
  });

  it('🛑 3. Odbij ako je niz pod-totala prazan', () => {
    const prazniSubtotali = {
      currencyCode: 'RSD',
      taxAmount: 0.00,
      taxSchemeId: 'VAT',
      subtotals: []
    };

    const res = safeParse(TaxTotalSchema, prazniSubtotali);
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('Poreski blok mora sadržati najmanje jedan TaxSubtotal čvor');
  });
});
