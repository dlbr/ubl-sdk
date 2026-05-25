import * as v from 'valibot';

// 1. Identifikacione mikro-šeme
export const PibSchema = v.pipe(v.string(), v.regex(/^\d{9}$/, '[FATAL] PIB mora sadržati tačno 9 numeričkih karaktera.'));
export const JbkjsSchema = v.pipe(v.string(), v.regex(/^\d{5}$/, '[FATAL] JBKJS mora sadržati tačno 5 numeričkih karaktera za budžetske korisnike.'));

// 2. Klasifikacija referenci kupca prema Vertex strukturi
export const SefBuyerReferenceType = v.picklist(
  ['UGOVOR', 'NARUDZBENICA', 'JAVNA_NABAVKA', 'NEMA'],
  '[FATAL] Nevalidan tip reference kupca.'
);

export const SefBuyerReferenceSchema = v.pipe(
  v.object({
    tip: SefBuyerReferenceType,
    vrednost: v.string([
      v.maxLength(50, '[FATAL] Vrednost reference kupca ne sme biti duža od 50 karaktera.')
    ])
  }),
  v.check((input) => {
    if (input.tip !== 'NEMA') {
      return input.vrednost.trim() !== '';
    }
    return true;
  }, '[FATAL] Ukoliko je izabran tip reference, polje vrednost ne sme biti prazno.')
);

// 3. Poreske stavke (Tax Subtotal)
export const TaxSubtotalSchema = v.object({
  taxableAmount: v.number([v.minValue(0, '[FATAL] Osnovica ne sme biti negativna.')]),
  taxAmount: v.number([v.minValue(0, '[FATAL] Iznos poreza ne sme biti negativan.')]),
  taxCategoryCode: v.picklist(['S', 'AE', 'Z', 'E'], '[FATAL] Poreska kategorija mora biti S, AE, Z ili E.'),
  taxExemptionReason: v.optional(v.string())
});

export const TaxTotalSchema = v.object({
  currencyCode: v.string([v.length(3)]),
  taxAmount: v.number(),
  subtotals: v.array(TaxSubtotalSchema)
});

// 4. Referenca na eOtpremnice
export const DespatchDocumentReferenceSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1, '[FATAL] ID otpremnice ne sme biti prazan.'), v.maxLength(50, '[FATAL] ID otpremnice ne sme biti duži od 50 karaktera.')),
  issueDate: v.optional(v.string([v.isoDate('[FATAL] Datum otpremnice mora biti u ispravnom ISO formatu.')]))
});

// 5. Referenca na prethodnu fakturu/avans (BillingReference)
export const SefInvoiceDocumentReferenceSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1, '[FATAL] ID prethodnog dokumenta unutar BillingReference ne sme biti prazan.'), v.maxLength(50, '[FATAL] ID prethodnog dokumenta ne sme biti duži od 50 karaktera.')),
  issueDate: v.pipe(v.string(), v.isoDate('[FATAL] Datum izdavanja prethodnog dokumenta (IssueDate) mora biti u ispravnom ISO formatu YYYY-MM-DD.'))
});

// 🛡️ KROVNI TITANIJUMSKI VALIDATOR (Srbija Profile)
export const SefInvoiceSchema = v.pipe(
  v.object({
    invoiceTypeCode: v.picklist(['380', '381', '383', '386'], '[FATAL] Nevalidan InvoiceTypeCode (Dozvoljeni: 380, 381, 383, 386).'),
    issueDate: v.string([v.isoDate('[FATAL] Nevalidan format datuma izdavanja.')]),
    paymentDueDate: v.string([v.isoDate('[FATAL] Nevalidan format roka plaćanja.')]),
    actualDeliveryDate: v.string([v.isoDate('[FATAL] Datum prometa je obavezan prema ZEF-u.')]),
    documentCurrencyCode: v.string([v.length(3)]),
    taxCurrencyCode: v.string([v.length(3)]),
    payableAmount: v.number([v.minValue(0)]),
    supplierPib: PibSchema,
    customerPib: PibSchema,
    customerJbkjs: v.optional(v.pipe(v.string(), JbkjsSchema)),
    invoicingPeriodCode: v.picklist(['35', '432', '3', '0'], '[FATAL] Nevalidan Invoicing Period Code.'),
    buyerReference: SefBuyerReferenceSchema,
    despatchDocumentReferences: v.optional(v.array(DespatchDocumentReferenceSchema)),
    billingReference: v.optional(SefInvoiceDocumentReferenceSchema),
    taxTotals: v.array(TaxTotalSchema)
  }),

  // Hronologija datuma
  v.check((input) => new Date(input.issueDate) <= new Date(input.paymentDueDate), '[FATAL] Rok plaćanja ne može biti pre datuma izdavanja fakture.'),

  // Avansni računi (386) zahtevaju fiksni rok i fiksnu šifru perioda
  v.check((input) => {
    if (input.invoiceTypeCode === '386') {
      return input.paymentDueDate === input.issueDate && input.invoicingPeriodCode === '432';
    }
    return true;
  }, '[FATAL] Avansni računi (386) moraju imati rok plaćanja jednak datumu izdavanja i koristiti invoicingPeriodCode 432.'),

  // 🎯 VERTEX [VRBL-RS-1p0p0-5] USLOVNA VALIDACIJA ZA KNJIŽNA ODOBRENJA (381):
  v.check((input) => {
    if (input.invoiceTypeCode === '381') {
      return !!input.billingReference && !!input.billingReference.id && !!input.billingReference.issueDate;
    }
    return true;
  }, '[FATAL] Knjižno odobrenje (381) mora sadržati BillingReference sa ispravnim ID-jem i datumom (IssueDate) originalne fakture koju korigujete.'),

  // Komercijalna faktura (380) na osnovu prometa (35) zahteva otpremnice
  v.check((input) => {
    if (input.invoiceTypeCode === '380' && input.invoicingPeriodCode === '35') {
      return !!input.despatchDocumentReferences && input.despatchDocumentReferences.length > 0;
    }
    return true;
  }, '[FATAL] Komercijalna faktura (380) zasnovana na prometu (kod 35) mora sadržati bar jednu referencu na eOtpremnicu.'),

  // 🎯 VERTEX / B2G ZAVISNA VALIDACIJA ZA BUYER REFERENCE:
  v.check((input) => {
    if (!!input.customerJbkjs && input.customerJbkjs.trim() !== '') {
      return input.buyerReference.tip !== 'NEMA';
    }
    return true;
  }, '[FATAL] Za budžetske korisnike (kupce sa JBKJS brojem), obavezno je uneti ispravan tip reference (Ugovor, Narudžbenica ili Javna Nabavka).'),

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
  }, '[FATAL] Devizne fakture moraju sadržati tačno dva TaxTotal bloka (jedan u devizama, jedan preračunat u RSD po kursu NBS).')
);

export type SefInvoiceInput = v.InferOutput<typeof SefInvoiceSchema>;
