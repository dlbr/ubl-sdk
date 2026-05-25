import { describe, it, expect } from 'vitest';
import { safeParse } from 'valibot';
import { SefInvoiceSchema } from '../src/validators/ubl';

describe('🛡️ Vertex Tax Breakdown Restrikcije [VRBL-CALC-24]', () => {

  const baseTemplate = {
    customizationId: 'urn:vertexinc:vrbl:billing:1',
    profileId: 'urn:vertexinc:vrbl:billing:1',
    routingDetails: { sender: 'RS113398540', receiver: 'GENERIC_RS_EINVOICE_1p0p0' },
    invoiceTypeCode: '380',
    supplierPib: '113398540',
    customerPib: '223344556',
    supplierElectronicAddress: { schemeId: '9948', value: '113398540' },
    supplierPartyIdentification: { schemeId: 'SRB:PIB', value: '113398540' },
    supplierPartyTaxScheme: { companySchemeId: 'RS', companyId: '113398540', taxSchemeId: 'VAT' },
    supplierPartyLegalEntity: { registrationName: 'FIRMA DOO', companySchemeId: 'RS:MB', companyId: '20123456' },
    customerElectronicAddress: { schemeId: '9948', value: '223344556' },
    customerPartyTaxScheme: { taxSchemeId: 'VAT', companyId: 'RS223344556' },
    customerPartyLegalEntity: { registrationName: 'KUPAC DOO', companySchemeId: 'RS:MB', companyId: '08123456' },
    issueDate: '2026-05-26',
    paymentDueDate: '2026-06-10',
    actualDeliveryDate: '2026-05-25',
    payableAmount: 11400.00,
    lineExtensionAmount: 9500.00,
    taxExclusiveAmount: 9500.00,
    taxInclusiveAmount: 11400.00,
    allowanceTotalAmount: 0.00,
    chargeTotalAmount: 0.00,
    documentCurrencyCode: 'RSD',
    taxCurrencyCode: 'RSD',
    invoicingPeriodCode: '35',
    buyerReference: { tip: 'NEMA', vrednost: 'N/A' },
    invoiceLines: [{ id: '1', name: 'Gorivo', invoicedQuantity: 1, unitCode: 'LTR', priceAmount: 9500, lineExtensionAmount: 9500, classifiedTaxCategory: { taxCategoryCode: 'S', taxCategoryPercent: 20.00, taxSchemeId: 'VAT' } }]
  };

  it('✅ 1. Prolaz za dokument gde se poreske osnovice sabiraju u tačnu krovnu osnovicu', () => {
    const ispravanBreakdown = {
      ...baseTemplate,
      despatchDocumentReferences: [{ id: 'OTP-1', issueDate: '2026-05-25' }],
      taxTotals: [
        {
          currencyCode: 'RSD',
          taxAmount: 1900.00,
          taxSchemeId: 'VAT',
          subtotals: [
            { taxableAmount: 9500.00, taxCategoryPercent: 20.00, taxAmount: 1900.00, taxCategoryCode: 'S' }
          ]
        }
      ]
    };

    const res = safeParse(SefInvoiceSchema, ispravanBreakdown);
    if (!res.success) console.log(JSON.stringify(res.issues, null, 2));
    expect(res.success).toBe(true);
  });

  it('🛑 2. Odbij ako zbir poreskih osnovica ne odgovara krovnoj poreskoj osnovici', () => {
    const losBreakdown = {
      ...baseTemplate,
      despatchDocumentReferences: [{ id: 'OTP-1', issueDate: '2026-05-25' }],
      taxExclusiveAmount: 10000.00, 
      taxTotals: [
        {
          currencyCode: 'RSD',
          taxAmount: 1900.00,
          taxSchemeId: 'VAT',
          subtotals: [
            { taxableAmount: 9500.00, taxCategoryPercent: 20.00, taxAmount: 1900.00, taxCategoryCode: 'S' }
          ]
        }
      ]
    };

    const res = safeParse(SefInvoiceSchema, losBreakdown);
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('Aritmetička greška [VRBL-CALC-10]');
  });
});
