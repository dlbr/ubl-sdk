import { describe, it, expect } from 'vitest';
import { safeParse } from 'valibot';
import { SefInvoiceSchema } from '../src/validators/ubl';

describe('🛡️ Vertex BuyerReference B2G Restrikcije', () => {

  const baseFakturaSaDrzavom = {
    invoiceTypeCode: '380',
    issueDate: '2026-05-26',
    paymentDueDate: '2026-06-10',
    actualDeliveryDate: '2026-05-25',
    documentCurrencyCode: 'RSD',
    taxCurrencyCode: 'RSD',
    payableAmount: 50000.00,
    supplierPib: '113398540',
    customerPib: '223344556',
    customerJbkjs: '03142', // 🏛️ Primalac je budžetski korisnik
    invoicingPeriodCode: '35',
    taxTotals: [{
      currencyCode: 'RSD',
      taxAmount: 2500.00,
      subtotals: [{ taxableAmount: 12500.00, taxAmount: 2500.00, taxCategoryCode: 'S' }]
    }]
  };

  it('✅ 1. Slanje državi sa uredno upisanim BuyerReference (broj ugovora) mora proći', () => {
    const validnaB2gFaktura = { 
      ...baseFakturaSaDrzavom, 
      buyerReference: 'UGOVOR-2026-994/B'
    };
    const res = safeParse(SefInvoiceSchema, validnaB2gFaktura);
    expect(res.success).toBe(true);
  });

  it('🛑 2. Slanje državi BEZ BuyerReference i BEZ BillingReference MORA biti strogo odbijeno', () => {
    const nevalidnaB2gFaktura = { 
      ...baseFakturaSaDrzavom, 
      buyerReference: undefined,
      billingReference: undefined 
    };
    const res = safeParse(SefInvoiceSchema, nevalidnaB2gFaktura);
    
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('Za budžetske korisnike (kupce sa JBKJS brojem), obavezno je uneti BuyerReference');
  });

  it('🛑 3. BuyerReference koji prelazi maksimalnu dužinu od 50 karaktera mora pasti', () => {
    const predugackaReferenca = { 
      ...baseFakturaSaDrzavom, 
      buyerReference: 'UGOVOR_KOJI_JE_PREVISE_DUGACKAJ_I_PRELAZI_DOZVOLJENE_GRANICE_ZA_SEF_XML' 
    };
    const res = safeParse(SefInvoiceSchema, predugackaReferenca);
    
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('BuyerReference ne sme biti duži od 50 karaktera.');
  });

  it('✅ 4. Za komercijalne privatne firme (bez JBKJS), BuyerReference ostaje opcion i račun prolazi prazan', () => {
    const privatnaFirmaFaktura = { 
      ...baseFakturaSaDrzavom, 
      customerJbkjs: undefined,
      buyerReference: undefined 
    };
    const res = safeParse(SefInvoiceSchema, privatnaFirmaFaktura);
    expect(res.success).toBe(true);
  });
});
