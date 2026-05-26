import { describe, it, expect } from 'vitest';
import { safeParse } from 'valibot';
import { SefInvoiceSchema } from '../src/validators/ubl';

describe('🛡️ Valibot Emulacija SEF Schematron Pravila', () => {

  const bazičnaValidnaFaktura = {
    invoiceTypeCode: '380',
    issueDate: '2026-05-26',
    paymentDueDate: '2026-06-10',
    actualDeliveryDate: '2026-05-25',
    documentCurrencyCode: 'RSD',
    taxCurrencyCode: 'RSD',
    payableAmount: 15000.00,
    supplierPib: '113398540',
    customerPib: '223344556',
    taxTotals: [{
      currencyCode: 'RSD',
      taxAmount: 2500.00,
      subtotals: [{ taxableAmount: 10000.00, taxAmount: 2500.00, taxCategoryCode: 'S' }]
    }]
  };

  it('✅ 1. Potpuno ispravna domaća faktura u RSD mora bez problema proći validator', () => {
    const res = safeParse(SefInvoiceSchema, bazičnaValidnaFaktura);
    if (!res.success) {
      console.log('Validation Issues:', JSON.stringify(res.issues, null, 2));
    }
    expect(res.success).toBe(true);
  });

  it('🛑 2. Odbij fakturu ako je PIB kraći ili sadrži slova', () => {
    const nevalidanPib = { ...bazičnaValidnaFaktura, supplierPib: '11339854ABC' };
    const res = safeParse(SefInvoiceSchema, nevalidanPib);
    if (res.success) console.log('Test 2 Unexpected Success:', res.output);
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('PIB mora sadržati tačno 9 numeričkih karaktera.');
  });

  it('🛑 3. Odbij fakturu ako je kupac budžetski korisnik, a uneti JBKJS kod je neispravan', () => {
    const nevalidanJbkjs = { ...bazičnaValidnaFaktura, customerJbkjs: '123' };
    const res = safeParse(SefInvoiceSchema, nevalidanJbkjs);
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('JBKJS mora sadržati tačno 5 numeričkih karaktera');
  });

  it('🛑 4. Avansni račun (386) MORA pasti ako nema upisan BillingReference', () => {
    const invalidAdvance = { ...bazičnaValidnaFaktura, invoiceTypeCode: '386', billingReference: '' };
    const res = safeParse(SefInvoiceSchema, invalidAdvance);
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('Avansni račun (386) mora sadržati BillingReference');
  });

  it('🛑 5. Odbij fakturu ako je rok plaćanja postavljen pre datuma izdavanja', () => {
    const nevalidniDatumi = { ...bazičnaValidnaFaktura, issueDate: '2026-05-26', paymentDueDate: '2026-05-20' };
    const res = safeParse(SefInvoiceSchema, nevalidniDatumi);
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('Rok plaćanja ne može biti pre datuma izdavanja');
  });

  it('🛑 6. Reverse Charge (AE) mora pasti ukoliko programer zaboravi da upiše tekstualni pravni osnov', () => {
    const nevalidanReverse = {
      ...bazičnaValidnaFaktura,
      taxTotals: [{
        currencyCode: 'RSD',
        taxAmount: 0,
        subtotals: [{ taxableAmount: 10000, taxAmount: 0, taxCategoryCode: 'AE', taxExemptionReason: '' }]
      }]
    };
    const res = safeParse(SefInvoiceSchema, nevalidanReverse);
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('Za Reverse Charge (AE) obavezno je navesti zakonski osnov');
  });

  it('✅ 7. Devizna faktura (EUR) sa duplim poreskim blokom (EUR + RSD preračun) mora uspešno proći', () => {
    const validnaDevizna = {
      ...bazičnaValidnaFaktura,
      documentCurrencyCode: 'EUR',
      taxCurrencyCode: 'RSD',
      payableAmount: 1000.00,
      taxTotals: [
        {
          currencyCode: 'EUR',
          taxAmount: 200.00,
          subtotals: [{ taxableAmount: 1000.00, taxAmount: 200.00, taxCategoryCode: 'S' }]
        },
        {
          currencyCode: 'RSD',
          taxAmount: 23414.00,
          subtotals: [{ taxableAmount: 117070.00, taxAmount: 23414.00, taxCategoryCode: 'S' }]
        }
      ]
    };
    const res = safeParse(SefInvoiceSchema, validnaDevizna);
    expect(res.success).toBe(true);
  });

  it('🛑 8. Devizna faktura (EUR) mora pasti ako sadrži samo devizni porez bez dinarskog ogledala', () => {
    const nevalidnaDevizna = {
      ...bazičnaValidnaFaktura,
      documentCurrencyCode: 'EUR',
      taxCurrencyCode: 'RSD',
      payableAmount: 1000.00,
      taxTotals: [
        {
          currencyCode: 'EUR',
          taxAmount: 200.00,
          subtotals: [{ taxableAmount: 1000.00, taxAmount: 200.00, taxCategoryCode: 'S' }]
        }
      ]
    };
    const res = safeParse(SefInvoiceSchema, nevalidnaDevizna);
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('Devizne fakture moraju sadržati tačno dva TaxTotal bloka');
  });
});
