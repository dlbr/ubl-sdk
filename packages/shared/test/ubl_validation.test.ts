import { describe, it, expect } from 'vitest';
import * as v from 'valibot';
import { SefUblValidationSchema } from '../src/validators/ubl';

describe('🧪 Valibot UBL Poreska Validacija (Vertex Srbija Pravila)', () => {

  it('✅ 1. Pravilna domaća faktura u RSD mora proći sa jednim TaxTotal-om', () => {
    const domacaFaktura = {
      documentCurrencyCode: 'RSD',
      taxTotals: [
        {
          currencyCode: 'RSD',
          taxAmount: 2000.00,
          subtotals: [
            { taxableAmount: 10000.00, taxAmount: 2000.00, taxCategoryCode: 'S' }
          ]
        }
      ]
    };

    const rezultat = v.safeParse(SefUblValidationSchema, domacaFaktura);
    expect(rezultat.success).toBe(true);
  });

  it('🛑 2. Faktura u EUR bez preračunatog RSD poreza MORA biti odbijena', () => {
    const nevalidnaDeviznaFaktura = {
      documentCurrencyCode: 'EUR',
      taxTotals: [
        {
          currencyCode: 'EUR',
          taxAmount: 170.00,
          subtotals: [
            { taxableAmount: 850.00, taxAmount: 170.00, taxCategoryCode: 'S' }
          ]
        }
      ]
    };

    const rezultat = v.safeParse(SefUblValidationSchema, nevalidnaDeviznaFaktura);
    expect(rezultat.success).toBe(false);
    expect(rezultat.issues?.[0].message).toContain('Fakture u stranoj valuti moraju sadržati dvostruki TaxTotal');
  });

  it('✅ 3. Legalna devizna faktura sa dvostrukim TaxTotal-om (EUR + RSD) prolazi štit', () => {
    const validnaDeviznaFaktura = {
      documentCurrencyCode: 'EUR',
      taxTotals: [
        {
          currencyCode: 'EUR',
          taxAmount: 200.00,
          subtotals: [{ taxableAmount: 1000.00, taxAmount: 200.00, taxCategoryCode: 'S' }]
        },
        {
          currencyCode: 'RSD',
          taxAmount: 23414.00, 
          subtotals: [{ taxableAmount: 117070.00, taxAmount: 23414.00, taxCategoryCode: 'S' }]
        }
      ]
    };

    const rezultat = v.safeParse(SefUblValidationSchema, validnaDeviznaFaktura);
    expect(rezultat.success).toBe(true);
  });
});
