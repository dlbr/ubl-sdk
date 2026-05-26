import { describe, it, expect } from 'vitest';
import { safeParse } from 'valibot';
import { SefInvoiceSchema } from '../src/validators/ubl';

describe('🛡️ Vertex Universal Invoice Root Restrikcije [/docs/specification-ids]', () => {

  const baseTemplate = {
    customizationId: 'urn:vertexinc:vrbl:billing:1',
    profileId: 'urn:vertexinc:vrbl:billing:1',
    routingDetails: { sender: 'RS113398540', receiver: 'GENERIC_RS_EINVOICE_1p0p0' },
    invoiceId: 'INV-2026-001',
    issueTime: '10:00:00',
    invoiceTypeCode: '380',
    supplierPib: '113398540',
    customerPib: '101134702',
    supplierElectronicAddress: { schemeId: '9948', value: '113398540' },
    supplierPartyIdentification: { schemeId: 'SRB:PIB', value: '113398540' },
    supplierPartyTaxScheme: { companySchemeId: 'RS', companyId: '113398540', taxSchemeId: 'VAT' },
    supplierPartyLegalEntity: { registrationName: 'FIRMA DOO', companySchemeId: 'RS:MB', companyId: '20123456' },
    customerElectronicAddress: { schemeId: '9948', value: '101134702' },
    customerPartyTaxScheme: { taxSchemeId: 'VAT', companyId: 'RS101134702' },
    customerPartyLegalEntity: { registrationName: 'KUPAC DOO', companySchemeId: 'RS:MB', companyId: '08123456' },
    issueDate: '2026-05-26',
    paymentDueDate: '2026-06-10',
    actualDeliveryDate: '2026-05-25',
    payableAmount: 5000.00,
    lineExtensionAmount: 5000.00,
    taxExclusiveAmount: 5000.00,
    taxInclusiveAmount: 6000.00,
    allowanceTotalAmount: 0.00,
    chargeTotalAmount: 0.00,
    documentCurrencyCode: 'RSD',
    taxCurrencyCode: 'RSD',
    invoicingPeriodCode: '35',
    buyerReference: { tip: 'NEMA', vrednost: '' },
    taxTotals: [{ currencyCode: 'RSD', taxAmount: 1000.00, taxSchemeId: 'VAT', subtotals: [{ taxableAmount: 5000.00, taxCategoryPercent: 20.00, taxAmount: 1000.00, taxCategoryCode: 'S' }] }],
    invoiceLines: [{ id: '1', name: 'Artikal', invoicedQuantity: 1, unitCode: 'PCS', priceAmount: 5000, lineExtensionAmount: 5000, classifiedTaxCategory: { taxCategoryCode: 'S', taxCategoryPercent: 20.00, taxSchemeId: 'VAT' } }]
  };

  it('✅ 1. Prolaz za dokument sa ispravnim SpecificationID i LocalProfileSpecificationID', () => {
    const ispravneSpecifikacije = {
      ...baseTemplate,
      despatchDocumentReferences: [{ id: 'OTP-1', issueDate: '2026-05-25' }],
      specificationId: 'urn:vertexinc:vrbl:spec:core:1',
      localProfileSpecificationId: 'urn:vertexinc:vrbl:spec:rs:1p0p0'
    };

    const res = safeParse(SefInvoiceSchema, ispravneSpecifikacije);
    if (!res.success) console.log(JSON.stringify(res.issues, null, 2));
    expect(res.success).toBe(true);
    });

    it('🛑 2. Odbij ako globalni SpecificationID ne odgovara standardu', () => {
    const losSpec = {
      ...baseTemplate,
      specificationId: 'urn:vertexinc:vrbl:spec:core:0p9',
      localProfileSpecificationId: 'urn:vertexinc:vrbl:spec:rs:1p0p0'
    };

    const res = safeParse(SefInvoiceSchema, losSpec);
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('SpecificationID mora biti "urn:vertexinc:vrbl:spec:core:1"');
    });

});
