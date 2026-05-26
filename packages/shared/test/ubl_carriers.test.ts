import { describe, it, expect } from 'vitest';
import { safeParse } from 'valibot';
import { SefInvoiceSchema } from '../src/validators/ubl';

describe('🛡️ Vertex Carrier and Logistics Restrikcije [VRBL-CORE-120/125]', () => {

  const baseTemplate = {
    customizationId: 'urn:vertexinc:vrbl:billing:1',
    profileId: 'urn:vertexinc:vrbl:billing:1',
    specificationId: 'urn:vertexinc:vrbl:spec:core:1',
    localProfileSpecificationId: 'urn:vertexinc:vrbl:spec:rs:1p0p0',
    routingDetails: { sender: 'RS113398540', receiver: 'GENERIC_RS_EINVOICE_1p0p0', documentScheme: 'RS_E_INVOICING', routingChannel: 'PRODUCTION' },
    businessProcessType: 'COMMERCIAL_INVOICING',
    businessContextId: 'urn:vertexinc:vrbl:context:rs:proc:1',
    invoiceId: 'INV-2026-TRSP',
    invoiceTypeCode: '380',
    issueDate: '2026-05-26',
    issueTime: '13:00:00',
    paymentDueDate: '2026-06-10',
    actualDeliveryDate: '2026-05-25',
    payableAmount: 24000.00,
    lineExtensionAmount: 20000.00,
    taxExclusiveAmount: 20000.00,
    taxInclusiveAmount: 24000.00,
    allowanceTotalAmount: 0.00,
    chargeTotalAmount: 0.00,
    invoicePeriod: { startDate: '2026-05-01', endDate: '2026-05-25' },
    supplierPib: '113398540',
    customerPib: '223344556',
    supplierElectronicAddress: { schemeId: '9948', value: '113398540' },
    supplierPartyIdentification: { schemeId: 'SRB:PIB', value: '113398540' },
    supplierPartyTaxScheme: { companySchemeId: 'RS', companyId: '113398540', taxSchemeId: 'VAT' },
    supplierPartyLegalEntity: { registrationName: 'FIRMA DOO', companySchemeId: 'RS:MB', companyId: '20123456' },
    customerElectronicAddress: { schemeId: '9948', value: '223344556' },
    customerPartyTaxScheme: { taxSchemeId: 'VAT', companyId: 'RS223344556' },
    customerPartyLegalEntity: { registrationName: 'KUPAC DOO', companySchemeId: 'RS:MB', companyId: '08123456' },
    invoicingPeriodCode: '35',
    buyerReference: { tip: 'NEMA', vrednost: '' },
    taxTotals: [{ currencyCode: 'RSD', taxAmount: 4000.00, taxSchemeId: 'VAT', subtotals: [{ taxableAmount: 20000.00, taxCategoryPercent: 20.00, taxAmount: 4000.00, taxCategoryCode: 'S' }] }],
    invoiceLines: [{ id: '1', name: 'Gorivo', invoicedQuantity: 1, unitCode: 'LTR', priceAmount: 20000, lineExtensionAmount: 20000, classifiedTaxCategory: { taxCategoryCode: 'S', taxCategoryPercent: 20.00, taxSchemeId: 'VAT' } }]
  };

  it('✅ 1. Prolaz za ispravno definisanu fakturu sa eksternom logističkom kompanijom', () => {
    const ispravanTransport = {
      ...baseTemplate,
      carrierParty: {
        carrierName: 'Milsped d.o.o.',
        carrierPib: 'RS101234567'
      }
    };

    const res = safeParse(SefInvoiceSchema, ispravanTransport);
    expect(res.success).toBe(true);
  });

  it('🛑 2. Odbij ako PIB prevoznika nema obavezni prefiks države RS', () => {
    const losFormatPib = {
      ...baseTemplate,
      carrierParty: {
        carrierName: 'Milsped d.o.o.',
        carrierPib: '101234567'
      }
    };

    const res = safeParse(SefInvoiceSchema, losFormatPib);
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('PIB prevoznika mora biti u ispravnom formatu sa prefiksom "RS"');
  });

  it('🛑 3. Odbij ako je programer greškom postavio sopstveni PIB kao eksternog prevoznika', () => {
    const dupliraniPib = {
      ...baseTemplate,
      carrierParty: {
        carrierName: 'Sopstvena Logistika Log',
        carrierPib: 'RS113398540'
      }
    };

    const res = safeParse(SefInvoiceSchema, dupliraniPib);
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('PIB eksternog prevoznika (carrierPib) ne može biti identičan PIB-u dobavljača');
  });
});
