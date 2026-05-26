import { describe, it, expect } from 'vitest';
import { safeParse } from 'valibot';
import { SefInvoiceSchema } from '../src/validators/ubl';

describe('🛡️ Valibot Emulacija SEF Schematron Pravila', () => {

  const bazičnaValidnaFaktura = {
    id: 'FKT-2026-01',
    invoiceTypeCode: '380',
    issueDate: '2026-05-26',
    paymentDueDate: '2026-06-10',
    documentCurrencyCode: 'RSD',
    taxCurrencyCode: 'RSD',
    payableAmount: 15000.00,
    lineExtensionAmount: 12500.00,
    taxExclusiveAmount: 12500.00,
    taxInclusiveAmount: 15000.00,
    pibS: '113398540',
    pibB: '101134702',
    taxTotals: [{
      taxAmount: 2500.00,
      taxSchemeId: 'VAT',
      subtotals: [{ taxableAmount: 12500.00, taxAmount: 2500.00, taxCategoryCode: 'S' }]
    }],
    invoiceLines: [{ id: '1', lineExtensionAmount: 12500.00 }]
  };

  it('✅ 1. Potpuno ispravna domaća faktura u RSD mora bez problema proći validator', () => {
    const res = safeParse(SefInvoiceSchema, bazičnaValidnaFaktura);
    if (!res.success) {
      console.log('Validation Issues:', JSON.stringify(res.issues, null, 2));
    }
    expect(res.success).toBe(true);
  });

  it('🛑 2. Odbij fakturu ako je PIB kraći ili sadrži slova', () => {
    const nevalidanPib = { ...bazičnaValidnaFaktura, pibS: '11339854ABC' };
    const res = safeParse(SefInvoiceSchema, nevalidanPib);
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('tačno 9 cifara');
  });

  it('🛑 3. Odbij fakturu ako je kupac budžetski korisnik, a uneti JBKJS kod je neispravan', () => {
    const nevalidanJbkjs = { ...bazičnaValidnaFaktura, jbkjsB: '123' };
    const res = safeParse(SefInvoiceSchema, nevalidanJbkjs);
    expect(res.success).toBe(false);
  });

  it('🛑 4. Knjižno odobrenje (381) MORA pasti ako nema upisan BillingReference i nema obuhvaćenog perioda', () => {
    const invalidCreditNote = { ...bazičnaValidnaFaktura, invoiceTypeCode: '381' };
    // @ts-ignore
    delete invalidCreditNote.billingReference;
    // @ts-ignore
    delete invalidCreditNote.invoicePeriod;
    const res = safeParse(SefInvoiceSchema, invalidCreditNote);
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('Knjižno odobrenje (381) mora sadržati BillingReference');
  });

  it('🛑 5. Odbij fakturu ako je rok plaćanja postavljen pre datuma izdavanja', () => {
    const nevalidniDatumi = { ...bazičnaValidnaFaktura, issueDate: '2026-05-26', paymentDueDate: '2026-05-20' };
    const res = safeParse(SefInvoiceSchema, nevalidniDatumi);
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('Rok plaćanja ne može biti pre datuma izdavanja');
  });

  it('✅ 7. Devizna faktura (EUR) sa duplim poreskim blokom (EUR + RSD preračun) mora uspešno proći', () => {
    const validnaDevizna = {
      ...bazičnaValidnaFaktura,
      documentCurrencyCode: 'EUR',
      taxCurrencyCode: 'RSD',
      lineExtensionAmount: 1000.00,
      taxExclusiveAmount: 1000.00,
      taxInclusiveAmount: 1200.00,
      payableAmount: 1200.00,
      invoiceLines: [{ id: '1', lineExtensionAmount: 1000.00 }],
      taxTotals: [
        {
          taxAmount: 200.00,
          taxSchemeId: 'VAT',
          subtotals: [{ taxableAmount: 1000.00, taxAmount: 200.00, taxCategoryCode: 'S' }]
        },
        {
          taxAmount: 23414.00,
          taxSchemeId: 'VAT',
          subtotals: [{ taxableAmount: 117070.00, taxAmount: 23414.00, taxCategoryCode: 'S' }]
        }
      ]
    };
    const res = safeParse(SefInvoiceSchema, validnaDevizna);
    if (!res.success) {
      console.log('Test 7 Validation Issues:', JSON.stringify(res.issues, null, 2));
    }
    expect(res.success).toBe(true);
  });

  it('🛑 8. Devizna faktura (EUR) mora pasti ako sadrži samo devizni porez bez dinarskog ogledala', () => {
    const nevalidnaDevizna = {
      ...bazičnaValidnaFaktura,
      documentCurrencyCode: 'EUR',
      taxCurrencyCode: 'RSD',
      taxTotals: [
        {
          taxAmount: 200.00,
          taxSchemeId: 'VAT',
          subtotals: [{ taxableAmount: 1000.00, taxAmount: 200.00, taxCategoryCode: 'S' }]
        }
      ]
    };
    const res = safeParse(SefInvoiceSchema, nevalidnaDevizna);
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('Devizne fakture moraju sadržati tačno dva TaxTotal bloka');
  });
});
