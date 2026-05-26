import { describe, it, expect } from 'vitest';
import * as v from 'valibot';
import { SefInvoiceSchema } from '../src/validators/ubl';

describe('🛡️ Vertex Tax Calculations Forenzika [VRBL-CALC-1 do VRBL-CALC-4]', () => {

  const baseValidPayload = {
    invoiceId: 'FAKTURA-2026-001',
    invoiceTypeCode: '380',
    issueDate: '2026-05-26',
    lineExtensionAmount: 100000.00,  // 100k neto u stavkama
    allowanceTotalAmount: 10000.00,  // 10k popust
    chargeTotalAmount: 5000.00,      // 5k trošak transporta
    taxExclusiveAmount: 95000.00,    // 100k - 10k + 5k = 95k osnovica (VRBL-CALC-1)
    taxAmount: 19000.00,             // 95k * 20% = 19k porez
    taxInclusiveAmount: 114000.00,   // 95k + 19k = 114k bruto (VRBL-CALC-3)
    payableAmount: 114000.00,
    invoiceLines: [
      { id: '1', lineExtensionAmount: 100000.00, taxCategoryCode: 'S', taxCategoryPercent: 20 }
    ],
    allowanceCharges: [
      { chargeIndicator: false, amount: 10000.00, taxCategoryCode: 'S', taxCategoryPercent: 20 },
      { chargeIndicator: true, amount: 5000.00, taxCategoryCode: 'S', taxCategoryPercent: 20 }
    ],
    taxSubtotals: [
      { taxableAmount: 95000.00, taxAmount: 19000.00, taxCategoryCode: 'S', taxCategoryPercent: 20 } // VRBL-CALC-2 i VRBL-CALC-4
    ]
  };

  it('✅ Prolaz za matematički besprekoran payload koji poštuje sva pravila', () => {
    const res = v.safeParse(SefInvoiceSchema, baseValidPayload);
    expect(res.success).toBe(true);
  });

  it('🛑 Odbij ako krovna osnovica krši pravilo VRBL-CALC-1', () => {
    const nevalidnaOsnovica = {
      ...baseValidPayload,
      taxExclusiveAmount: 999999.00 // Skroz pogrešna osnovica
    };
    const res = v.safeParse(SefInvoiceSchema, nevalidnaOsnovica);
    expect(res.success).toBe(false);
    expect(res.issues[0].message).toContain('VRBL-CALC-1');
  });

  it('🛑 Odbij ako se krovni porez ne slaže sa sumom poreskih grupa (VRBL-CALC-2)', () => {
    const nevalidanPorez = {
      ...baseValidPayload,
      taxAmount: 50000.00 // Krovni porez se ne slaže sa 19k iz subtotala
    };
    const res = v.safeParse(SefInvoiceSchema, nevalidanPorez);
    expect(res.success).toBe(false);
    expect(res.issues[0].message).toContain('VRBL-CALC-2');
  });

  it('🛑 Odbij ako bruto iznos krši pravilo VRBL-CALC-3', () => {
    const nevalidanBruto = {
      ...baseValidPayload,
      taxInclusiveAmount: 120000.00 // Treba da bude 114000
    };
    const res = v.safeParse(SefInvoiceSchema, nevalidanBruto);
    expect(res.success).toBe(false);
    expect(res.issues[0].message).toContain('VRBL-CALC-3');
  });

  it('🛑 Odbij ako granularna osnovica unutar grupe krši pravilo VRBL-CALC-4', () => {
    const nevalidanSubtotalTaxable = {
      ...baseValidPayload,
      taxSubtotals: [
        { taxableAmount: 100000.00, taxAmount: 19000.00, taxCategoryCode: 'S', taxCategoryPercent: 20 } // Osnovica grupe ignorisala popust/trošak
      ]
    };
    const res = v.safeParse(SefInvoiceSchema, nevalidanSubtotalTaxable);
    expect(res.success).toBe(false);
    expect(res.issues[0].message).toContain('VRBL-CALC-4');
  });
});
