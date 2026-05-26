import { describe, it, expect } from 'vitest';
import { safeParse } from 'valibot';
import { SefInvoiceSchema } from '../src/validators/ubl';

describe('🛡️ Vertex Universal Invoice Period Restrikcije [VRBL-CORE-80/85]', () => {

  const baseTemplate = {
    invoiceId: 'INV-2026-PER',
    invoiceTypeCode: '380',
    issueDate: '2026-05-26', // Danas je 26. maj 2026.
    issueTime: '08:00:00',
    paymentDueDate: '2026-06-10',
    actualDeliveryDate: '2026-05-25',
    invoicingPeriodCode: '35',
    documentCurrencyCode: 'RSD',
    taxCurrencyCode: 'RSD',
    customizationId: 'urn:vertexinc:vrbl:billing:1',
    profileId: 'urn:vertexinc:vrbl:billing:1',
    specificationId: 'urn:vertexinc:vrbl:spec:core:1',
    localProfileSpecificationId: 'urn:vertexinc:vrbl:spec:rs:1p0p0',
    businessProcessType: 'COMMERCIAL_INVOICING',
    businessContextId: 'urn:vertexinc:vrbl:context:rs:proc:1',
    routingDetails: { sender: 'RS113398540', receiver: 'GENERIC_RS_EINVOICE_1p0p0', documentScheme: 'RS_E_INVOICING', routingChannel: 'PRODUCTION' },
    supplierPib: '113398540',
    customerPib: '223344556',
    supplierElectronicAddress: { schemeId: '9948', value: '113398540' },
    supplierPartyIdentification: { schemeId: 'SRB:PIB', value: '113398540' },
    supplierPartyTaxScheme: { companySchemeId: 'RS', companyId: '113398540', taxSchemeId: 'VAT' },
    supplierPartyLegalEntity: { registrationName: 'FIRMA DOO', companySchemeId: 'RS:MB', companyId: '20123456' },
    customerElectronicAddress: { schemeId: '9948', value: '223344556' },
    customerPartyTaxScheme: { taxSchemeId: 'VAT', companyId: 'RS223344556' },
    customerPartyLegalEntity: { registrationName: 'KUPAC DOO', companySchemeId: 'RS:MB', companyId: '08123456' },
    lineExtensionAmount: 1000,
    allowanceTotalAmount: 0,
    chargeTotalAmount: 0,
    taxExclusiveAmount: 1000,
    taxInclusiveAmount: 1200,
    payableAmount: 1200,
    buyerReference: { tip: 'NEMA', vrednost: '' },
    taxTotals: [{ currencyCode: 'RSD', taxAmount: 200.00, taxSchemeId: 'VAT', subtotals: [{ taxableAmount: 1000.00, taxCategoryPercent: 20.00, taxAmount: 200.00, taxCategoryCode: 'S' }] }],
    invoiceLines: [{ id: '1', name: 'Artikal', invoicedQuantity: 1, unitCode: 'PCS', priceAmount: 1000, lineExtensionAmount: 1000, classifiedTaxCategory: { taxCategoryCode: 'S', taxCategoryPercent: 20.00, taxSchemeId: 'VAT' } }]
  };

  it('✅ 1. Prolaz za ispravan retroaktivni mesečni obračunski period', () => {
    const ispravanPeriod = {
      ...baseTemplate,
      despatchDocumentReferences: [{ id: 'OTP-1', issueDate: '2026-05-25' }],
      invoicePeriod: {
        startDate: '2026-05-01',
        endDate: '2026-05-25' // 🟢 Završava se juče, pre datuma izdavanja
      }
    };

    const res = safeParse(SefInvoiceSchema, ispravanPeriod);
    if (!res.success) console.log(JSON.stringify(res.issues, null, 2));
    expect(res.success).toBe(true);
  });

  it('🛑 2. Odbij ako je endDate stariji od startDate (invertovan period)', () => {
    const invertovanPeriod = {
      ...baseTemplate,
      invoicePeriod: {
        startDate: '2026-05-25',
        endDate: '2026-05-01' // ❌ Greška: Nemoguća hronologija
      }
    };

    const res = safeParse(SefInvoiceSchema, invertovanPeriod);
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('Datum završetka perioda (endDate) ne može biti stariji');
  });

  it('🛑 3. Odbij ako se period završava u budućnosti u odnosu na datum izdavanja', () => {
    const buduciPeriod = {
      ...baseTemplate,
      invoicePeriod: {
        startDate: '2026-05-01',
        endDate: '2026-06-01' // ❌ Greška: Faktura izdata 26. maja ne može da zatvori period koji traje do juna
      }
    };

    const res = safeParse(SefInvoiceSchema, buduciPeriod);
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('Obračunski period se ne može završavati u budućnosti');
  });
});
