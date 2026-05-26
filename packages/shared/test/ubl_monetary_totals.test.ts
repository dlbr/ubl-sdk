import { describe, it, expect } from 'vitest';
import * as v from 'valibot';
import { SefInvoiceSchema } from '../src/validators/ubl';

describe('🛡️ Vertex LegalMonetaryTotal Restrikcije [SEF-CALC-5 do SEF-CALC-8]', () => {

  const baseValidPayload = {
    customizationId: 'urn:vertexinc:vrbl:billing:1',
    profileId: 'urn:vertexinc:vrbl:billing:1',
    routingDetails: { sender: 'RS113398540', receiver: 'GENERIC_RS_EINVOICE_1p0p0' },
    invoiceId: 'FAKTURA-2026-002',
    invoiceTypeCode: '380',
    issueDate: '2026-05-26',
    issueTime: '12:00:00',
    invoicePeriod: { startDate: '2026-05-01', endDate: '2026-05-25' },
    lineExtensionAmount: 100000.00,
    allowanceTotalAmount: 10000.00,
    chargeTotalAmount: 5000.00,
    taxExclusiveAmount: 95000.00,
    taxInclusiveAmount: 114000.00,
    prepaidAmount: 20000.00,
    payableAmount: 94000.00,
    taxAmount: 19000.00,
    invoiceLines: [
      { id: '1', lineExtensionAmount: 100000.00, taxCategoryCode: 'S', taxCategoryPercent: 20 }
    ],
    taxSubtotals: [
      { taxableAmount: 95000.00, taxAmount: 19000.00, taxCategoryCode: 'S', taxCategoryPercent: 20 }
    ],
    allowanceCharges: []
  };

  it('✅ Prolaz za matematički besprekoran payload', () => {
    const res = v.safeParse(SefInvoiceSchema, baseValidPayload);
    expect(res.success).toBe(true);
  });

  it('🛑 Odbij ako poreska osnovica krši pravilo SEF-CALC-5', () => {
    const nevalidnaOsnovica = {
      ...baseValidPayload,
      taxExclusiveAmount: 105000.00 // ❌ Pogrešno
    };
    const res = v.safeParse(SefInvoiceSchema, nevalidnaOsnovica);
    expect(res.success).toBe(false);
    expect(res.issues[0].message).toContain('SEF-CALC-1');
  });

  it('🛑 Odbij ako iznos za uplatu krši pravilo SEF-CALC-6', () => {
    const nevalidanPayable = {
      ...baseValidPayload,
      payableAmount: 114000.00 // ❌ Ignorisao prepaidAmount
    };
    const res = v.safeParse(SefInvoiceSchema, nevalidanPayable);
    expect(res.success).toBe(false);
    expect(res.issues[0].message).toContain('SEF-CALC-6');
  });

  it('🛑 Odbij ako krovni neto iznos krši pravilo SEF-CALC-8', () => {
    const nevalidanLineExtension = {
      ...baseValidPayload,
      lineExtensionAmount: 50000.00 // ❌ Ne odgovara sumi linija (100k)
    };
    const res = v.safeParse(SefInvoiceSchema, nevalidanLineExtension);
    expect(res.success).toBe(false);
    expect(res.issues[0].message).toContain('SEF-CALC-1');
  });
});
