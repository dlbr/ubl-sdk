import { describe, it, expect } from 'vitest';
import { safeParse } from 'valibot';
import { SefInvoiceSchema } from '../src/validators/ubl';

describe('🛡️ Vertex Tender and Lot References Restrikcije [VRBL-CORE-110/115]', () => {

  const baseTemplate = {
    customizationId: 'urn:vertexinc:vrbl:billing:1',
    profileId: 'urn:vertexinc:vrbl:billing:1',
    specificationId: 'urn:vertexinc:vrbl:spec:core:1',
    localProfileSpecificationId: 'urn:vertexinc:vrbl:spec:rs:1p0p0',
    routingDetails: { sender: 'RS113398540', receiver: 'GENERIC_RS_EINVOICE_1p0p0', documentScheme: 'RS_E_INVOICING', routingChannel: 'PRODUCTION' },
    businessProcessType: 'COMMERCIAL_INVOICING',
    businessContextId: 'urn:vertexinc:vrbl:context:rs:proc:1',
    invoiceId: 'INV-2026-B2G',
    invoiceTypeCode: '380',
    issueDate: '2026-05-26',
    issueTime: '12:00:00',
    paymentDueDate: '2026-06-10',
    actualDeliveryDate: '2026-05-25',
    supplierPib: '113398540',
    customerPib: '223344556',
    supplierElectronicAddress: { schemeId: '9948', value: '113398540' },
    supplierPartyIdentification: { schemeId: 'SRB:PIB', value: '113398540' },
    supplierPartyTaxScheme: { companySchemeId: 'RS', companyId: '113398540', taxSchemeId: 'VAT' },
    supplierPartyLegalEntity: { registrationName: 'FIRMA DOO', companySchemeId: 'RS:MB', companyId: '20123456' },
    customerElectronicAddress: { schemeId: '9948', value: '223344556' },
    customerPartyTaxScheme: { taxSchemeId: 'VAT', companyId: 'RS223344556' },
    customerPartyLegalEntity: { registrationName: 'KUPAC DOO', companySchemeId: 'RS:MB', companyId: '08123456' },
    documentCurrencyCode: 'RSD',
    taxCurrencyCode: 'RSD',
    invoicingPeriodCode: '35',
    buyerReference: { tip: 'NEMA', vrednost: '' },
    invoicePeriod: { startDate: '2026-05-01', endDate: '2026-05-25' },
    payableAmount: 150000,
    lineExtensionAmount: 150000,
    taxExclusiveAmount: 150000,
    taxInclusiveAmount: 180000,
    allowanceTotalAmount: 0,
    chargeTotalAmount: 0,
    taxTotals: [{ currencyCode: 'RSD', taxAmount: 30000.00, taxSchemeId: 'VAT', subtotals: [{ taxableAmount: 150000.00, taxCategoryPercent: 20.00, taxAmount: 30000.00, taxCategoryCode: 'S' }] }],
    invoiceLines: [{ id: '1', name: 'Roba', invoicedQuantity: 1, unitCode: 'PCS', priceAmount: 150000, lineExtensionAmount: 150000, classifiedTaxCategory: { taxCategoryCode: 'S', taxCategoryPercent: 20.00, taxSchemeId: 'VAT' } }]
  };

  it('✅ 1. Prolaz za B2G fakturu sa ispravno deklarisanom javnom nabavkom i partijom ugovora', () => {
    const ispravnaJavnaNabavka = {
      ...baseTemplate,
      despatchDocumentReferences: [{ id: 'OTP-1', issueDate: '2026-05-25' }],
      tenderDocumentReference: {
        id: 'JN-OPS-2026/04',
        documentTypeCode: '50'
      },
      contractDocumentReference: {
        id: 'UG-PARTIJA-01'
      }
    };

    const res = safeParse(SefInvoiceSchema, ispravnaJavnaNabavka);
    if (!res.success) console.log(JSON.stringify(res.issues, null, 2));
    expect(res.success).toBe(true);
  });

  it('🛑 2. Odbij ako je documentTypeCode tenderske reference pogrešan', () => {
    const losKodTendera = {
      ...baseTemplate,
      tenderDocumentReference: {
        id: 'JN-OPS-2026/04',
        documentTypeCode: '170'
      }
    };

    const res = safeParse(SefInvoiceSchema, losKodTendera);
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('DocumentTypeCode unutar tenderske reference mora biti striktno postavljen na "50"');
  });

  it('🛑 3. Odbij ako je poslat contractDocumentReference sa praznim ID-jem', () => {
    const prazanUgovor = {
      ...baseTemplate,
      contractDocumentReference: {
        id: ''
      }
    };

    const res = safeParse(SefInvoiceSchema, prazanUgovor);
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('ID ugovora/partije ne sme biti prazan');
  });
});
