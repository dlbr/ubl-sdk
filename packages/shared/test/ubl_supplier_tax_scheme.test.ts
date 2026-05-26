import { describe, it, expect } from 'vitest';
import { safeParse } from 'valibot';
import { SefInvoiceSchema } from '../src/validators/ubl';

describe('🛡️ Vertex Supplier Tax Scheme Restrikcije [VRBL-RS-1p0p0-8]', () => {

  const baseTemplate = {
    invoiceTypeCode: '380',
    supplierPib: '113398540',
    customerPib: '101134702',
    supplierElectronicAddress: { schemeId: '9948', value: '113398540' },
    supplierPartyIdentification: { schemeId: 'SRB:PIB', value: '113398540' },
    supplierPartyLegalEntity: { registrationName: 'Firma', companySchemeId: 'RS:MB', companyId: '20123456' },
    issueDate: '2026-05-26',
    paymentDueDate: '2026-06-10',
    actualDeliveryDate: '2026-05-25',
    payableAmount: 5000.00,
    documentCurrencyCode: 'RSD',
    taxCurrencyCode: 'RSD',
    invoicingPeriodCode: '35',
    buyerReference: { tip: 'NEMA', vrednost: 'N/A' },
    despatchDocumentReferences: [{ id: 'OTP-1', issueDate: '2026-05-25' }],
    customerElectronicAddress: { schemeId: '9948', value: '101134702' },
    taxTotals: [{ currencyCode: 'RSD', taxAmount: 1000.00, subtotals: [{ taxableAmount: 5000.00, taxAmount: 1000.00, taxCategoryCode: 'S' }] }]
  };

  it('✅ 1. Prolaz za standardnog PDV obveznika (taxSchemeId = "VAT")', () => {
    const pdvObveznik = {
      ...baseTemplate,
      supplierPartyTaxScheme: {
        companySchemeId: 'RS',
        companyId: '113398540',
        taxSchemeId: 'VAT'
      }
    };

    const res = safeParse(SefInvoiceSchema, pdvObveznik);
    if (!res.success) console.log(JSON.stringify(res.issues, null, 2));
    expect(res.success).toBe(true);
  });

  it('✅ 2. Prolaz za preduzetnika paušalca van sistema PDV-a (taxSchemeId = "TAX")', () => {
    const pausalacObveznik = {
      ...baseTemplate,
      supplierPartyTaxScheme: {
        companySchemeId: 'RS',
        companyId: '113398540',
        taxSchemeId: 'TAX'
      }
    };

    const res = safeParse(SefInvoiceSchema, pausalacObveznik);
    if (!res.success) console.log(JSON.stringify(res.issues, null, 2));
    expect(res.success).toBe(true);
  });

  it('🛑 3. Odbij ako je uneta interna lokalizovana šifra (npr. "PDV")', () => {
    const losTaxScheme = {
      ...baseTemplate,
      supplierPartyTaxScheme: {
        companySchemeId: 'RS',
        companyId: '113398540',
        taxSchemeId: 'PDV'
      }
    };

    const res = safeParse(SefInvoiceSchema, losTaxScheme);
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('mora biti postavljena na "VAT" ili "TAX"');
  });
});
