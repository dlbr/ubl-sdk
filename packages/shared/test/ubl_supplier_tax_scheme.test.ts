import { describe, it, expect } from 'vitest';
import { safeParse } from 'valibot';
import { SefInvoiceSchema } from '../src/validators/ubl';

describe('🛡️ Vertex Supplier Tax Scheme Restrikcije [VRBL-RS-1p0p0-8]', () => {

  const baseTemplate = {
    invoiceTypeCode: '380',
    supplierPib: '113398540',
    customerPib: '223344556',
    supplierElectronicAddress: { schemeId: '9948', value: '113398540' },
    supplierPartyIdentification: { schemeId: 'SRB:PIB', value: '113398540' },
    issueDate: '2026-05-26',
    paymentDueDate: '2026-06-10',
    actualDeliveryDate: '2026-05-25',
    payableAmount: 5000.00,
    documentCurrencyCode: 'RSD',
    taxCurrencyCode: 'RSD',
    invoicingPeriodCode: '35',
    buyerReference: { tip: 'NEMA', vrednost: 'N/A' },
    taxTotals: [{ currencyCode: 'RSD', taxAmount: 1000.00, subtotals: [{ taxableAmount: 5000.00, taxAmount: 1000.00, taxCategoryCode: 'S' }] }]
  };

  it('✅ 1. Faktura sa ispravno mapiranim PartyTaxScheme blokom mora proći', () => {
    const validnaFaktura = {
      ...baseTemplate,
      despatchDocumentReferences: [{ id: 'OTP-1', issueDate: '2026-05-25' }],
      supplierPartyTaxScheme: {
        companySchemeId: 'RS',
        companyId: '113398540',
        taxSchemeId: 'VAT'
      }
    };

    const res = safeParse(SefInvoiceSchema, validnaFaktura);
    if (!res.success) {
      console.log('Validation issues:', JSON.stringify(res.issues, null, 2));
    }
    expect(res.success).toBe(true);
  });
  // ... rest of tests
});
