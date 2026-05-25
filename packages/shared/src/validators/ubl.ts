import * as v from 'valibot';

// 1. Mikro-šeme za identifikaciju (PIB i JBKJS)
export const PibSchema = v.string([
  v.regex(/^\d{9}$/, '[FATAL] PIB mora sadržati tačno 9 numeričkih karaktera.')
]);

export const JbkjsSchema = v.string([
  v.regex(/^\d{5}$/, '[FATAL] JBKJS mora sadržati tačno 5 numeričkih karaktera za budžetske korisnike.')
]);

// 2. Šema za pojedinačnu stavku poreza (Tax Subtotal)
export const TaxSubtotalSchema = v.pipe(
  v.object({
    taxableAmount: v.number([v.minValue(0, '[FATAL] Finansijski iznosi (osnovica) ne smeju biti negativni.')]),
    taxAmount: v.number([v.minValue(0, '[FATAL] Finansijski iznosi (porez) ne smeju biti negativni.')]),
    taxCategoryCode: v.picklist(['S', 'AE', 'Z', 'E', 'AE20', 'AE10', 'S20', 'S10'], '[FATAL] Poreska kategorija mora biti S, AE, Z ili E.'),
    taxExemptionReason: v.optional(v.string())
  }),
  v.check((input) => {
    if (input.taxCategoryCode === 'AE') {
      return !!input.taxExemptionReason && input.taxExemptionReason.trim() !== '';
    }
    return true;
  }, '[FATAL] Za Reverse Charge (AE) obavezno je navesti zakonski osnov (TaxExemptionReason).')
);

// 3. Glavna poreska šema (Tax Total)
export const TaxTotalSchema = v.object({
  currencyCode: v.string([v.length(3, '[FATAL] Oznaka valute mora imati tačno 3 slova.')]),
  taxAmount: v.number([v.minValue(0)]),
  subtotals: v.array(TaxSubtotalSchema)
});

// 1. Definišemo 4 dozvoljene UNTDID 2005 šifre za Srbiju
export const SefInvoicePeriodDescriptionCode = v.picklist(
  ['35', '432', '3', '0'],
  '[FATAL] Nevalidan Invoice Period Description Code. Dozvoljene vrednosti: 35, 432, 3, 0.'
);

// 4. 🛡️ TITANIJUMSKA ŠEMA ZA SEF INVOICE (Srbija Profile via Vertex)
export const SefInvoiceSchema = v.pipe(
  v.object({
    invoiceTypeCode: v.picklist(['380', '381', '383', '386'], '[FATAL] Nevalidan InvoiceTypeCode (Dozvoljeni: 380, 381, 383, 386).'),
    issueDate: v.string([v.isoDate('[FATAL] Nevalidan format datuma izdavanja.')]),
    paymentDueDate: v.string([v.isoDate('[FATAL] Nevalidan format roka plaćanja.')]),
    actualDeliveryDate: v.string([v.isoDate('[FATAL] Datum prometa (ActualDeliveryDate) je obavezan prema ZEF-u i Vertexu.')]),
    documentCurrencyCode: v.string([v.length(3)]),
    taxCurrencyCode: v.string([v.length(3)]),
    payableAmount: v.number([v.minValue(0, '[FATAL] Krajnji iznos (PayableAmount) ne sme biti negativan.')]),
    billingReference: v.optional(v.string()), 
    supplierPib: v.pipe(v.string(), v.regex(/^\d{9}$/, '[FATAL] PIB mora sadržati tačno 9 numeričkih karaktera.')),
    customerPib: v.pipe(v.string(), v.regex(/^\d{9}$/, '[FATAL] PIB mora sadržati tačno 9 numeričkih karaktera.')),
    customerJbkjs: v.optional(v.pipe(v.string(), v.regex(/^\d{5}$/, '[FATAL] JBKJS mora sadržati tačno 5 numeričkih karaktera za budžetske korisnike.'))),
    // 🟢 Novi obavezni element prema Vertexu: Invoicing Period Description Code
    invoicingPeriodCode: SefInvoicePeriodDescriptionCode,
    taxTotals: v.array(TaxTotalSchema, [v.minLength(1, '[FATAL] Faktura mora imati bar jedan TaxTotal blok.')])
  }),

  // 🎯 VERTEX / SCHEMATRON PRAVILO: Hronologija datuma
  v.check((input) => {
    return new Date(input.issueDate) <= new Date(input.paymentDueDate);
  }, '[FATAL] Rok plaćanja ne može biti pre datuma izdavanja fakture.'),

  // 🎯 VERTEX / SCHEMATRON PRAVILO: Avansni računi (386) zahtevaju BillingReference
  v.check((input) => {
    if (input.invoiceTypeCode === '386') {
      return !!input.billingReference && input.billingReference.trim() !== '';
    }
    return true;
  }, '[FATAL] Avansni račun (386) mora sadržati BillingReference ka prethodnom avansnom zahtevu.'),

  // 🎯 VERTEX / SCHEMATRON PRAVILO: Valutna konzistentnost za domaći promet
  v.check((input) => {
    if (input.documentCurrencyCode === 'RSD') {
      return input.taxCurrencyCode === 'RSD' && input.taxTotals.every(t => t.currencyCode === 'RSD');
    }
    return true;
  }, '[FATAL] Ukoliko je faktura u RSD, poreska valuta i svi porezi moraju biti iskazani isključivo u RSD.'),

  // 🎯 VERTEX PRAVILO: Dupli TaxTotal za devizne fakture
  v.check((input) => {
    if (input.documentCurrencyCode !== 'RSD') {
      if (input.taxTotals.length !== 2) return false;
      const imaRsdPorez = input.taxTotals.some(t => t.currencyCode === 'RSD');
      const imaDevizniPorez = input.taxTotals.some(t => t.currencyCode === input.documentCurrencyCode);
      return imaRsdPorez && imaDevizniPorez;
    }
    return true;
  }, '[FATAL] Devizne fakture moraju sadržati tačno dva TaxTotal bloka (jedan u devizama, jedan preračunat u RSD po kursu NBS).'),

  // 🎯 VERTEX / SCHEMATRON PRAVILO: ZAVISNA VALIDACIJA ZA INVOICING PERIOD
  v.check((input) => {
    if (input.invoiceTypeCode === '386') {
      return input.invoicingPeriodCode === '432';
    }
    if (input.invoiceTypeCode === '380' && input.invoicingPeriodCode === '432') {
      return false;
    }
    return true;
  }, '[FATAL] Neslaganje poreskog osnova: Avansni računi (386) moraju koristiti kod 432, dok standardne fakture (380) koriste 35, 3 ili 0.')
);


export type SefInvoiceInput = v.InferOutput<typeof SefInvoiceSchema>;
