import { describe, it, expect } from 'vitest';
import { safeParse } from 'valibot';
import { SefInvoiceSchema } from '../src/validators/ubl';

describe('🛡️ Vertex Supplier ID Restrikcije [VRBL-RS-1p0p0-7]', () => {

  const baseTemplate = {
    invoiceTypeCode: '380',
    supplierPib: '113398540',
    customerPib: '101134702',
    supplierElectronicAddress: { schemeId: '9948', value: '113398540' },
    issueDate: '2026-05-26',
    paymentDueDate: '2026-06-10',
    actualDeliveryDate: '2026-05-25',
    payableAmount: 5000.00,
    documentCurrencyCode: 'RSD',
    taxCurrencyCode: 'RSD',
    invoicingPeriodCode: '35',
    buyerReference: { tip: 'NEMA', vrednost: 'N/A' },
    despatchDocumentReferences: [{ id: 'OTP-1', issueDate: '2026-05-25' }],
    taxTotals: [{ currencyCode: 'RSD', taxAmount: 1000.00, subtotals: [{ taxableAmount: 5000.00, taxAmount: 1000.00, taxCategoryCode: 'S' }] }]
  };

  it('✅ 1. Faktura sa ispravno konfigurisanom PartyIdentification strukturom mora proći', () => {
    const validnaFaktura = {
      ...baseTemplate,
      supplierPartyIdentification: {
        schemeId: 'SRB:PIB',
        value: '113398540'
      }
    };

    const res = safeParse(SefInvoiceSchema, validnaFaktura);
    expect(res.success).toBe(true);
  });

  it('🛑 2. Odbij fakturu ako je schemeId neispravan (promašen SRB:PIB prefiks)', () => {
    const losScheme = {
      ...baseTemplate,
      supplierPartyIdentification: {
        schemeId: 'PIB',
        value: '113398540'
      }
    };

    const res = safeParse(SefInvoiceSchema, losScheme);
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('schemeID za poresku identifikaciju prodavca');
  });

  it('🛑 3. Odbij fakturu ako se PIB unutar Supplier ID razlikuje od PIB-a u zaglavlju', () => {
    const neskladanPib = {
      ...baseTemplate,
      supplierPartyIdentification: {
        schemeId: 'SRB:PIB',
        value: '888888888'
      }
    };

    const res = safeParse(SefInvoiceSchema, neskladanPib);
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('identična glavnom PIB-u prodavca');
  });
});
