import { describe, it, expect } from 'vitest';
import { safeParse } from 'valibot';
import { SefInvoiceSchema } from '../src/validators/ubl';

describe('🛡️ Vertex BillingReference Restrikcije [VRBL-RS-1p0p0-5]', () => {

  const baseFakturaTemplate = {
    invoiceTypeCode: '380',
    issueDate: '2026-05-26',
    paymentDueDate: '2026-06-10',
    actualDeliveryDate: '2026-05-25',
    documentCurrencyCode: 'RSD',
    taxCurrencyCode: 'RSD',
    payableAmount: 50000.00,
    supplierPib: '113398540',
    customerPib: '101134702',
    invoicingPeriodCode: '35',
    buyerReference: { tip: 'NEMA', vrednost: 'N/A' },
    taxTotals: [{ currencyCode: 'RSD', taxAmount: 2500.00, subtotals: [{ taxableAmount: 12500.00, taxAmount: 2500.00, taxCategoryCode: 'S' }] }]
  };

  it('✅ 1. Knjižno odobrenje (381) sa kompletnim podacima originalnog računa mora proći', () => {
    const validnoOdobrenje = {
      ...baseFakturaTemplate,
      invoiceTypeCode: '381',
      billingReference: {
        id: 'FX-2026-0089',
        issueDate: '2026-05-10'
      }
    };

    const res = safeParse(SefInvoiceSchema, validnoOdobrenje);
    expect(res.success).toBe(true);
  });

  it('🛑 2. Knjižno odobrenje (381) BEZ priložene billing reference MORA pasti', () => {
    const loseOdobrenje = {
      ...baseFakturaTemplate,
      invoiceTypeCode: '381',
      billingReference: undefined
    };

    const res = safeParse(SefInvoiceSchema, loseOdobrenje);
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('Knjižno odobrenje (381) mora sadržati BillingReference');
  });

  it('🛑 3. Knjižno odobrenje gde je poslat ID ali je izostavljen datum (IssueDate) mora pasti', () => {
    const odobrenjeBezDatuma = {
      ...baseFakturaTemplate,
      invoiceTypeCode: '381',
      billingReference: {
        id: 'FX-2026-0089',
        issueDate: 'invalid-date' 
      }
    };

    const res = safeParse(SefInvoiceSchema, odobrenjeBezDatuma);
    expect(res.success).toBe(false);
  });
});
