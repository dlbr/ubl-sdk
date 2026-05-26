import { describe, it, expect } from 'vitest';
import { safeParse } from 'valibot';
import { SefInvoiceSchema } from '../src/validators/ubl';

describe('🛡️ Vertex Advanced Payment ID Restrikcije [VRBL-RS-1p0p0-16]', () => {

  const baseTemplate = {
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
    documentCurrencyCode: 'RSD',
    taxCurrencyCode: 'RSD',
    invoicingPeriodCode: '35',
    buyerReference: { tip: 'NEMA', vrednost: 'N/A' },
    taxTotals: [{ currencyCode: 'RSD', taxAmount: 1000.00, subtotals: [{ taxableAmount: 5000.00, taxAmount: 1000.00, taxCategoryCode: 'S' }] }]
  };

  it('✅ 1. Konačna faktura (380) sa uredno uvezanim avansnim računom mora proći', () => {
    const validnaKonavnaFaktura = {
      ...baseTemplate,
      invoiceTypeCode: '380',
      despatchDocumentReferences: [{ id: 'OTP-1', issueDate: '2026-05-25' }],
      advancePaymentReferences: [
        { schemeId: 'SRB:ADVANCE', value: 'AVN-2026-0012' }
      ]
    };

    const res = safeParse(SefInvoiceSchema, validnaKonavnaFaktura);
    if (!res.success) console.log(JSON.stringify(res.issues, null, 2));
    expect(res.success).toBe(true);
  });

  it('🛑 2. Odbij fakturu ako je atribut schemeId pogrešan (npr. promašen prefiks)', () => {
    const losScheme = {
      ...baseTemplate,
      invoiceTypeCode: '380',
      advancePaymentReferences: [
        { schemeId: 'ADVANCE', value: 'AVN-2026-0012' }
      ]
    };

    const res = safeParse(SefInvoiceSchema, losScheme);
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('schemeID za avansnu referencu unutar OriginatorDocumentReference mora biti "SRB:ADVANCE"');
  });

  it('🛑 3. Odbij ako se prebijanje avansa pokuša ugurati unutar samog novog Avansnog računa (386)', () => {
    const losAvansniUgovor = {
      ...baseTemplate,
      invoiceTypeCode: '386',
      invoicingPeriodCode: '432',
      paymentDueDate: '2026-05-26',
      advancePaymentReferences: [
        { schemeId: 'SRB:ADVANCE', value: 'AVN-2026-0012' }
      ]
    };

    const res = safeParse(SefInvoiceSchema, losAvansniUgovor);
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('se mogu nalaziti isključivo unutar Konačne Fakture (tip 380)');
  });
});
