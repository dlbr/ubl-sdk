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

// 6. Šema za elektronsku adresu (EndpointID) prema pravilu [VRBL-RS-1p0p0-6]
export const SefEndpointIdSchema = v.object({
  schemeId: v.literal('9948', '[FATAL] schemeID za elektronsku adresu prodavca u Srbiji mora biti "9948".'),
  value: v.pipe(v.string(), v.regex(/^\d{9}$/, '[FATAL] Elektronska adresa prodavca (vrednost) mora biti tačno devetocifreni PIB.'))
});

// 7. Šema za poresku identifikaciju stranke (PartyIdentification/ID) prema [VRBL-RS-1p0p0-7]
export const SefPartyIdentificationSchema = v.object({
  schemeId: v.literal('SRB:PIB', '[FATAL] schemeID za poresku identifikaciju prodavca (Supplier ID) mora biti "SRB:PIB".'),
  value: v.pipe(v.string(), v.regex(/^\d{9}$/, '[FATAL] Poreski identifikacioni broj unutar Supplier ID mora imati tačno 9 cifara.'))
});

// 8. Šema za poreski sistem kompanije (PartyTaxScheme) prema [VRBL-RS-1p0p0-8]
export const SefPartyTaxSchemeSchema = v.object({
  companySchemeId: v.literal('RS', '[FATAL] schemeID za CompanyID unutar PartyTaxScheme mora biti "RS".'),
  companyId: v.pipe(v.string(), v.regex(/^\d{9}$/, '[FATAL] CompanyID unutar poreskog sistema prodavca mora imati tačno 9 cifara.')),
  taxSchemeId: v.picklist(['VAT', 'TAX'], '[FATAL] Poreska šema (TaxScheme ID) za prodavca u Srbiji mora biti postavljena na "VAT" ili "TAX".')
});

// 9. Šema za pravni entitet kompanije (PartyLegalEntity) prema [VRBL-RS-1p0p0-9]
export const SefPartyLegalEntitySchema = v.object({
  registrationName: v.pipe(v.string(), v.minLength(1, '[FATAL] Naziv kompanije (RegistrationName) prodavca ne sme biti prazan.')),
  companySchemeId: v.literal('RS:MB', '[FATAL] schemeID za CompanyID unutar PartyLegalEntity mora biti "RS:MB".'),
  companyId: v.pipe(v.string(), v.regex(/^\d{8}$/, '[FATAL] Matični broj firme (CompanyID) unutar PartyLegalEntity mora imati tačno 8 numeričkih karaktera.'))
});
// 10. Šema za elektronsku adresu kupca (EndpointID) prema pravilu [VRBL-RS-1p0p0-10]
export const SefCustomerEndpointSchema = v.object({
  schemeId: v.literal('9948', '[FATAL] schemeID za elektronsku adresu kupca (Buyer Endpoint) mora biti "9948".'),
  value: v.union([
    v.pipe(v.string(), v.regex(/^\d{9}$/, '[FATAL] PIB kupca mora imati tačno 9 cifara.')),
    v.pipe(v.string(), v.regex(/^\d{13}$/, '[FATAL] JMBG kupca mora imati tačno 13 cifara.'))
  ], '[FATAL] Elektronska adresa kupca (EndpointID) mora biti ili 9-cifreni PIB ili 13-cifreni JMBG.')
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
    customerPib: v.string([v.regex(/^\d{9,13}$/, '[FATAL] PIB ili JMBG kupca mora imati 9 ili 13 cifara.')]),
    customerJbkjs: v.optional(v.pipe(v.string(), JbkjsSchema)),
    invoicingPeriodCode: v.picklist(['35', '432', '3', '0'], '[FATAL] Nevalidan Invoicing Period Code.'),
    buyerReference: SefBuyerReferenceSchema,
    despatchDocumentReferences: v.optional(v.array(DespatchDocumentReferenceSchema)),
    billingReference: v.optional(SefInvoiceDocumentReferenceSchema),
    taxTotals: v.array(TaxTotalSchema),
    supplierElectronicAddress: SefEndpointIdSchema,
    supplierPartyIdentification: SefPartyIdentificationSchema,
    supplierPartyTaxScheme: SefPartyTaxSchemeSchema,
    supplierPartyLegalEntity: SefPartyLegalEntitySchema,
    // 🟢 Novi obavezni element za kupca prema Vertex pravilu
    customerElectronicAddress: SefCustomerEndpointSchema
  }),


  v.check((input) => new Date(input.issueDate) <= new Date(input.paymentDueDate), '[FATAL] Rok plaćanja ne može biti pre datuma izdavanja fakture.'),

  v.check((input) => {
    if (input.invoiceTypeCode === '386') {
      return input.paymentDueDate === input.issueDate && input.invoicingPeriodCode === '432';
    }
    return true;
  }, '[FATAL] Avansni računi (386) moraju imati rok plaćanja jednak datumu izdavanja i koristiti invoicingPeriodCode 432.'),

  v.check((input) => {
    if (input.invoiceTypeCode === '381') {
      return !!input.billingReference && !!input.billingReference.id && !!input.billingReference.issueDate;
    }
    return true;
  }, '[FATAL] Knjižno odobrenje (381) mora sadržati BillingReference sa ispravnim ID-jem i datumom (IssueDate) originalne fakture koju korigujete.'),

  v.check((input) => {
    if (input.invoiceTypeCode === '380' && input.invoicingPeriodCode === '35') {
      return !!input.despatchDocumentReferences && input.despatchDocumentReferences.length > 0;
    }
    return true;
  }, '[FATAL] Komercijalna faktura (380) zasnovana na prometu (kod 35) mora sadržati bar jednu referencu na eOtpremnicu.'),

  v.check((input) => {
    if (!!input.customerJbkjs && input.customerJbkjs.trim() !== '') {
      return input.buyerReference.tip !== 'NEMA';
    }
    return true;
  }, '[FATAL] Za budžetske korisnike (kupce sa JBKJS brojem), obavezno je uneti ispravan tip reference (Ugovor, Narudžbenica ili Javna Nabavka).'),

  v.check((input) => {
    return input.supplierElectronicAddress.value === input.supplierPib;
  }, '[FATAL] Poreski nesklad: Vrednost u supplierElectronicAddress mora biti identična PIB-u prodavca.'),

  v.check((input) => {
    return input.supplierPartyIdentification.value === input.supplierPib;
  }, '[FATAL] Poreski nesklad: Vrednost u supplierPartyIdentification (Supplier ID) mora biti identična glavnom PIB-u prodavca.'),

  // 🎯 VERTEX / SCHEMATRON PRAVILO: ZAVISNA VALIDACIJA ZA CUSTOMER ENDPOINT
  v.check((input) => {
    return input.customerElectronicAddress.value === input.customerPib;
  }, '[FATAL] Poreski nesklad: Vrednost u customerElectronicAddress mora biti identična PIB-u ili JMBG-u kupca.'),

  v.check((input) => {
    return input.supplierPartyTaxScheme.companyId === input.supplierPib;
  }, '[FATAL] Poreski nesklad: Vrednost u supplierPartyTaxScheme (CompanyID) mora biti identična glavnom PIB-u prodavca.'),

  v.check((input) => {
    if (input.documentCurrencyCode === 'RSD') {
      return input.taxCurrencyCode === 'RSD' && input.taxTotals.every(t => t.currencyCode === 'RSD');
    }
    return true;
  }, '[FATAL] Ukoliko je faktura u RSD, poreska valuta i svi porezi moraju biti iskazani isključivo u RSD.'),

  v.check((input) => {
    if (input.documentCurrencyCode !== 'RSD') {
      if (input.taxTotals.length !== 2) return false;
      const imaRsdPorez = input.taxTotals.some(t => t.currencyCode === 'RSD');
      const imaDevizniPorez = input.taxTotals.some(t => t.currencyCode === input.documentCurrencyCode);
      return imaRsdPorez && imaDevizniPorez;
    }
    return true;
  }, '[FATAL] Devizne fakture moraju sadržati tačno dva TaxTotal bloka (jedan u devizama, jedan preračunat u RSD po kursu NBS).'),

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
