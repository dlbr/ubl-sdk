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
export const SefTaxCategoryPicklist = v.picklist(
  ['S', 'AE', 'Z', 'E', 'R', 'O', 'OE', 'SS', 'N'],
  '[FATAL] Nevalidna poreska kategorija. Vertex dopušta isključivo oznake: S, AE, Z, E, R, O, OE, SS, N.'
);

export const TaxSubtotalSchema = v.pipe(
  v.object({
    taxableAmount: v.number([v.minValue(0, '[FATAL] Osnovica ne sme biti negativna.')]),
    taxAmount: v.number([v.minValue(0, '[FATAL] Iznos poreza ne sme biti negativan.')]),
    taxCategoryCode: SefTaxCategoryPicklist,
    taxCategoryPercent: v.number([v.minValue(0, '[FATAL] Poreska stopa mora biti pozitivna.'), v.maxValue(100, '[FATAL] Poreska stopa ne može preći 100%.')]),
    exemptionReasonCode: v.optional(v.string()),
    taxExemptionReason: v.optional(v.string())
  }),
  v.check((input) => {
    if (input.taxCategoryCode !== 'S') {
      return !!input.exemptionReasonCode && input.exemptionReasonCode.trim() !== '';
    }
    return true;
  }, '[FATAL] Za sve poreske kategorije osim standardne (S), obavezno je uneti šifru zakonskog osnova (exemptionReasonCode).'),
  
  v.check((input) => {
    const ocekivaniPorez = Math.round((input.taxableAmount * input.taxCategoryPercent / 100) * 100) / 100;
    return Math.abs(input.taxAmount - ocekivaniPorez) < 0.01;
  }, '[FATAL] Aritmetička greška [VRBL-CALC-21]: Iznos poreza (taxAmount) unutar podtotala ne odgovara proračunu na osnovu stope i osnovice.')
);

export const TaxTotalSchema = v.pipe(
  v.object({
    currencyCode: v.string([v.length(3)]),
    taxAmount: v.number([v.minValue(0)]),
    taxSchemeId: v.literal('VAT', '[FATAL] Krovna poreska shema (TaxScheme ID) mora biti postavljena na "VAT".'),
    subtotals: v.array(TaxSubtotalSchema)
  }),
  v.check((input) => input.subtotals.length > 0, '[FATAL] Poreski blok mora sadržati najmanje jedan TaxSubtotal čvor.'),
  v.check((input) => {
    const sumaPodTotala = input.subtotals.reduce((acc, sub) => acc + sub.taxAmount, 0);
    return Math.abs(input.taxAmount - sumaPodTotala) < 0.01;
  }, '[FATAL] Aritmetička greška [VRBL-CALC-2]: Ukupan poreski iznos (taxAmount) mora biti jednak sumi svih pojedinačnih poreskih podtotala.')
);

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

// 12. Šema za poreski sistem kupca (PartyTaxScheme) prema [VRBL-RS-1p0p0-12]
export const SefCustomerPartyTaxSchemeSchema = v.object({
  taxSchemeId: v.literal('VAT', '[FATAL] Poreska šema za kupca (TaxScheme ID) mora biti fiksirana na "VAT".'),
  companyId: v.union([
    v.pipe(v.string(), v.regex(/^(RS)?\d{9}$/, '[FATAL] CompanyID kupca mora biti validan srpski PIB (opciono sa RS prefiksom).')),
    v.pipe(v.string(), v.regex(/^\d{13}$/, '[FATAL] CompanyID kupca (JMBG) mora imati tačno 13 cifara.'))
  ])
});

// 13. Šema za pravni entitet kupca (PartyLegalEntity) prema [VRBL-RS-1p0p0-13]
export const SefCustomerPartyLegalEntitySchema = v.union([
  v.object({
    registrationName: v.pipe(v.string(), v.minLength(1, '[FATAL] Naziv kupca ne sme biti prazan.')),
    companySchemeId: v.literal('RS:MB', '[FATAL] Za matični broj kupca, schemeID mora biti "RS:MB".'),
    companyId: v.pipe(v.string(), v.regex(/^\d{8}$/, '[FATAL] Matični broj kupca mora imati tačno 8 cifara.'))
  }),
  v.object({
    registrationName: v.pipe(v.string(), v.minLength(1, '[FATAL] Naziv kupca ne sme biti prazan.')),
    companySchemeId: v.literal('RS:JMBG', '[FATAL] Za JMBG kupca, schemeID mora biti "RS:JMBG".'),
    companyId: v.pipe(v.string(), v.regex(/^\d{13}$/, '[FATAL] JMBG kupca mora imati tačno 13 cifara.'))
  })
], '[FATAL] Nevalidna struktura pravnog entiteta kupca.');

// 14. Šema za referenciranje avansnih računa (OriginatorDocumentReference) prema [VRBL-RS-1p0p0-16]
export const SefAdvancePaymentReferenceSchema = v.object({
  schemeId: v.literal('SRB:ADVANCE', '[FATAL] schemeID za avansnu referencu unutar OriginatorDocumentReference mora biti "SRB:ADVANCE".'),
  value: v.pipe(v.string(), v.minLength(1, '[FATAL] Broj avansnog računa ne sme biti prazan.'), v.maxLength(50, '[FATAL] Broj avansnog računa ne sme biti duži od 50 karaktera.'))
});

// 15. Šema za univerzalni Vertex rutirajući omotač prema pravilu [VRBL-CORE-3]
export const SefVrblRoutingDetailsSchema = v.object({
  sender: v.pipe(v.string(), v.regex(/^RS\d{9}$/, '[FATAL] Vertex VRBL-CORE-3: Sender u rutiranju mora biti PIB prodavca sa prefiksom "RS" (npr. RS113398540).')),
  receiver: v.literal('GENERIC_RS_EINVOICE_1p0p0', '[FATAL] Vertex VRBL-CORE-3: Receiver string mora biti striktno postavljen na "GENERIC_RS_EINVOICE_1p0p0".')
});

// 16. Šema za pojedinačnu stavku fakture (InvoiceLine) prema [VRBL-CALC-30]
export const SefInvoiceLineSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1, '[FATAL] ID stavke (redni broj linije) mora biti definisan.')),
  name: v.pipe(v.string(), v.minLength(1, '[FATAL] Naziv artikla/usluge na liniji ne sme biti prazan.')),
  invoicedQuantity: v.number([v.minValue(0.0001, '[FATAL] Količina na stavci mora biti veća od nule.')]),
  unitCode: v.pipe(v.string(), v.minLength(1, '[FATAL] Jedinica mere (unitCode) je obavezna.')),
  priceAmount: v.number([v.minValue(0, '[FATAL] Cena artikla ne sme biti negativna.')]),
  lineExtensionAmount: v.number([v.minValue(0)]),
  classifiedTaxCategory: v.object({
    taxCategoryCode: SefTaxCategoryPicklist,
    taxCategoryPercent: v.number([v.minValue(0), v.maxValue(100)]),
    taxSchemeId: v.literal('VAT', '[FATAL] TaxScheme na nivou stavke mora biti "VAT".')
  })
});

// 17. Šema za popuste i troškove (AllowanceCharge) prema Vertex specifikaciji
export const SefAllowanceChargeSchema = v.pipe(
  v.object({
    chargeIndicator: v.boolean('[FATAL] chargeIndicator mora biti true (trošak) ili false (popust).'),
    amount: v.number([v.minValue(0.01, '[FATAL] Iznos AllowanceCharge mora biti veći od nule.')]),
    baseAmount: v.optional(v.number([v.minValue(0)])),
    multiplierFactorNumeric: v.optional(v.number([v.minValue(0), v.maxValue(100)])),
    allowanceChargeReasonCode: v.optional(v.string([v.maxLength(10)])),
    allowanceChargeReason: v.optional(v.string([v.minLength(1)])),
    taxCategory: v.object({
      taxCategoryCode: SefTaxCategoryPicklist,
      taxCategoryPercent: v.number([v.minValue(0), v.maxValue(100)]),
      taxSchemeId: v.literal('VAT', '[FATAL] TaxScheme na nivou stavke mora biti "VAT".')
    })
  }),
  v.check((input) => {
    if (input.baseAmount !== undefined && input.multiplierFactorNumeric !== undefined) {
      const ocekivaniIznos = Math.round((input.baseAmount * input.multiplierFactorNumeric / 100) * 100) / 100;
      return Math.abs(input.amount - ocekivaniIznos) < 0.01;
    }
    return true;
  }, '[FATAL] Aritmetička greška: Iznos (amount) unutar AllowanceCharge se ne poklapa sa proračunom na osnovu baze i procenta.')
);

// 18. Šema za napomene (Note) prema [VRBL-CORE-60/65]
export const SefInvoiceNoteSchema = v.pipe(
  v.string('[FATAL] Napomena mora biti tekstualnog tipa.'),
  v.maxLength(1000, '[FATAL] VRBL-NOTE: Pojedinačna napomena (Note) ne sme biti duža od 1000 karaktera.'),
  v.check((text) => !(/<|>|&(?![a-zA-Z0-9#]+;)/.test(text)), '[FATAL] VRBL-NOTE: Tekst napomene sadrži zabranjene sirove XML karaktere (<, >, &). Koristite ispravne XML entitete.')
);

// 19. Šema za valute (ISO 4217) prema [VRBL-CORE-71]
export const IsoCurrencySchema = v.pipe(
  v.string('[FATAL] Oznaka valute mora biti tekstualnog tipa.'),
  v.length(3, '[FATAL] VRBL-CURRENCY: Oznaka valute mora imati tačno 3 karaktera (ISO 4217 standard).'),
  v.transform((val) => val.toUpperCase())
);

// 20. Šema za obračunski period (InvoicePeriod) prema [VRBL-CORE-80/85]
export const SefInvoicePeriodSchema = v.object({
  startDate: v.string([v.isoDate('[FATAL] Datum početka perioda (startDate) mora biti u ISO formatu YYYY-MM-DD.')]),
  endDate: v.string([v.isoDate('[FATAL] Datum završetka perioda (endDate) mora biti u ISO formatu YYYY-MM-DD.')])
});

// 21. Šema za tender i ugovor prema [VRBL-CORE-110/115]
export const SefTenderDocumentReferenceSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1, '[FATAL] VRBL-TENDER: Broj javne nabavke (Tender ID) ne sme biti prazan string.')),
  documentTypeCode: v.literal('50', '[FATAL] VRBL-TENDER: DocumentTypeCode unutar tenderske reference mora biti striktno postavljen na "50".')
});

// 🛡️ KROVNI TITANIJUMSKI VALIDATOR (Srbija Profile)
export const SefInvoiceSchema = v.pipe(
  v.object({
    customizationId: v.literal('urn:vertexinc:vrbl:billing:1', '[FATAL] VRBL-CORE-4: CustomizationID mora biti "urn:vertexinc:vrbl:billing:1".'),
    profileId: v.literal('urn:vertexinc:vrbl:billing:1', '[FATAL] VRBL-CORE-5: ProfileID mora biti "urn:vertexinc:vrbl:billing:1".'),
    specificationId: v.literal('urn:vertexinc:vrbl:spec:core:1', '[FATAL] VRBL-CORE-10: SpecificationID mora biti "urn:vertexinc:vrbl:spec:core:1".'),
    localProfileSpecificationId: v.literal('urn:vertexinc:vrbl:spec:rs:1p0p0', '[FATAL] VRBL-CORE-15: LocalProfileSpecificationID za Srbiju mora biti "urn:vertexinc:vrbl:spec:rs:1p0p0".'),
    routingDetails: SefVrblRoutingDetailsSchema,
    businessProcessType: v.literal('COMMERCIAL_INVOICING', '[FATAL] VRBL-CONTEXT: businessProcessType mora biti striktno postavljen na "COMMERCIAL_INVOICING".'),
    businessContextId: v.literal('urn:vertexinc:vrbl:context:rs:proc:1', '[FATAL] VRBL-CONTEXT: businessContextId za profil Srbije mora biti striktno "urn:vertexinc:vrbl:context:rs:proc:1".'),

    // 🟢 Korenski identifikatori
    invoiceId: v.pipe(v.string(), v.minLength(1, '[FATAL] VRBL-CORE: Broj fakture (invoiceId) ne sme biti prazan.'), v.maxLength(50, '[FATAL] VRBL-CORE: Broj fakture ne sme biti duži od 50 karaktera.')),
    issueTime: v.pipe(v.string(), v.regex(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/, '[FATAL] VRBL-CORE: Vreme izdavanja (issueTime) mora biti u ispravnom formatu hh:mm:ss.')),
    invoicePeriod: SefInvoicePeriodSchema,

    // 🟢 Tenderske reference
    tenderDocumentReference: v.optional(SefTenderDocumentReferenceSchema),
    contractDocumentReference: v.optional(v.object({
      id: v.pipe(v.string(), v.minLength(1, '[FATAL] ID ugovora/partije ne sme biti prazan.'))
    })),

    invoiceTypeCode: v.picklist(['380', '381', '383', '386'], '[FATAL] Nevalidan InvoiceTypeCode (Dozvoljeni: 380, 381, 383, 386).'),
    issueDate: v.string([v.isoDate('[FATAL] Nevalidan format datuma izdavanja.')]),
    paymentDueDate: v.string([v.isoDate('[FATAL] Nevalidan format roka plaćanja.')]),
    actualDeliveryDate: v.string([v.isoDate('[FATAL] Datum prometa je obavezan prema ZEF-u.')]),
    
    // 🟢 Valutne oznake
    documentCurrencyCode: IsoCurrencySchema,
    taxCurrencyCode: IsoCurrencySchema,

    payableAmount: v.number([v.minValue(0)]),
    lineExtensionAmount: v.number([v.minValue(0)]),
    taxExclusiveAmount: v.number([v.minValue(0)]),
    taxInclusiveAmount: v.number([v.minValue(0)]),
    allowanceTotalAmount: v.number([v.minValue(0)]),
    chargeTotalAmount: v.number([v.minValue(0)]),
    prepaidAmount: v.optional(v.number([v.minValue(0)])),
    
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
    customerElectronicAddress: SefCustomerEndpointSchema,
    customerPartyTaxScheme: SefCustomerPartyTaxSchemeSchema,
    customerPartyLegalEntity: SefCustomerPartyLegalEntitySchema,
    advancePaymentReferences: v.optional(v.array(SefAdvancePaymentReferenceSchema)),
    allowanceCharges: v.optional(v.array(SefAllowanceChargeSchema)),
    notes: v.optional(v.pipe(
      v.array(SefInvoiceNoteSchema),
      v.transform((arr) => arr.filter(note => note.trim().length > 0))
    )),
    invoiceLines: v.array(SefInvoiceLineSchema, [v.minLength(1, '[FATAL] Faktura mora sadržati najmanje jednu stavku (InvoiceLine).')])
  }),

  // Hronologija datuma
  v.check((input) => new Date(input.issueDate) <= new Date(input.paymentDueDate), '[FATAL] Rok plaćanja ne može biti pre datuma izdavanja fakture.'),

  // 🎯 VERTEX [VRBL-CORE-82] HRONOLOŠKI KONTINUITET PERIODA
  v.check((input) => {
    const start = new Date(input.invoicePeriod.startDate).getTime();
    const end = new Date(input.invoicePeriod.endDate).getTime();
    return end >= start;
  }, '[FATAL] Hronološka greška [VRBL-CORE-82]: Datum završetka perioda (endDate) ne može biti stariji od datuma početka perioda (startDate).'),

  // 🎯 VERTEX [VRBL-CORE-83] ODNOS PERIODA I IZDAVANJA
  v.check((input) => {
    const end = new Date(input.invoicePeriod.endDate).getTime();
    const issue = new Date(input.issueDate).getTime();
    return end <= issue;
  }, '[FATAL] Hronološka greška [VRBL-CORE-83]: Obračunski period se ne može završavati u budućnosti u odnosu na datum izdavanja fakture (issueDate).'),

  // 🎯 VERTEX [VRBL-CORE-16] ZABRANA OTPREMNICA NA AVANSIMA
  v.check((input) => {
    if (input.invoiceTypeCode === '386') {
      return !input.despatchDocumentReferences || input.despatchDocumentReferences.length === 0;
    }
    return true;
  }, '[FATAL] Strukturalna greška [VRBL-CORE-16]: Avansni račun (tip 386) ne može sadržati reference na otpremnice.'),

  // 🎯 VERTEX [VRBL-CORE-18] ZABRANA NEGATIVNIH TOTALA
  v.check((input) => {
    return input.lineExtensionAmount >= 0 && input.taxExclusiveAmount >= 0 && input.taxInclusiveAmount >= 0;
  }, '[FATAL] Aritmetička greška [VRBL-CORE-18]: Finansijske vrednosti u totalima moraju biti izražene kao pozitivni brojevi.'),

  v.check((input) => {
    for (const line of input.invoiceLines) {
      const ocekivaniLineNeto = Math.round((line.invoicedQuantity * line.priceAmount) * 100) / 100;
      if (Math.abs(line.lineExtensionAmount - ocekivaniLineNeto) > 0.01) return false;
    }
    return true;
  }, '[FATAL] Aritmetička greška na nivou stavke: lineExtensionAmount na liniji mora biti tačan proizvod količine i cene (invoicedQuantity * priceAmount).'),

  v.check((input) => {
    const sumaSvihLinija = input.invoiceLines.reduce((acc, line) => acc + line.lineExtensionAmount, 0);
    return Math.abs(input.lineExtensionAmount - sumaSvihLinija) < 0.01;
  }, '[FATAL] Aritmetička greška: Krovna suma stavki (lineExtensionAmount) na dnu fakture mora biti jednaka egzaktnom zbiru vrednosti svih pojedinačnih linija fakture.'),

  v.check((input) => {
    const krovneStope = input.taxTotals.flatMap(t => t.subtotals.map(s => `${s.taxCategoryCode}-${s.taxCategoryPercent}`));
    for (const line of input.invoiceLines) {
      const linijskiKljuc = `${line.classifiedTaxCategory.taxCategoryCode}-${line.classifiedTaxCategory.taxCategoryPercent}`;
      if (!krovneStope.includes(linijskiKljuc)) return false;
    }
    return true;
  }, '[FATAL] Poreska neusaglašenost [VRBL-CALC-31]: Poreska kategorija i stopa definisane na nivou stavke se ne poklapaju ni sa jednim krovnim poreskim podtotalom (TaxSubtotal) na dnu računa.'),

  v.check((input) => {
    const ukupniPorez = input.taxTotals.reduce((acc, t) => acc + t.taxAmount, 0);
    const ocekivaniTotal = Math.round((input.taxExclusiveAmount + ukupniPorez) * 100) / 100;
    return Math.abs(input.taxInclusiveAmount - ocekivaniTotal) < 0.01;
  }, '[FATAL] Aritmetička greška [VRBL-CALC-10]: Ukupan iznos sa porezom (taxInclusiveAmount) mora biti tačan zbir osnovice i ukupnog poreza.'),

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

  v.check((input) => {
    return input.supplierPartyTaxScheme.companyId === input.supplierPib;
  }, '[FATAL] Poreski nesklad: Vrednost u supplierPartyTaxScheme (CompanyID) mora biti identična glavnom PIB-u prodavca.'),

  v.check((input) => {
    const pibBezRs = input.customerPartyTaxScheme.companyId.replace(/^RS/, '');
    return pibBezRs === input.customerPib;
  }, '[FATAL] Poreski nesklad: Vrednost u customerPartyTaxScheme (CompanyID) mora odgovarati glavnom identifikatoru kupca (customerPib).'),

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
  }, '[FATAL] Neslaganje poreskog osnova: Avansni računi (386) moraju koristiti kod 432, dok standardne fakture (380) koriste 35, 3 ili 0.'),

  v.check((input) => {
    if (input.advancePaymentReferences && input.advancePaymentReferences.length > 0) {
      return input.invoiceTypeCode === '380';
    }
    return true;
  }, '[FATAL] Strukturalna greška [VRBL-CALC-10]: Reference prebijanja avansa (OriginatorDocumentReference) se mogu nalaziti isključivo unutar Konačne Fakture (tip 380).'),

  v.check((input) => {
    const cisceniSenderPib = input.routingDetails.sender.replace(/^RS/, '');
    return cisceniSenderPib === input.supplierPib;
  }, '[FATAL] Poreski nesklad: PIB unutar routingDetails.sender mora odgovarati biznis PIB-u prodavca (supplierPib).'),

  v.check((input) => {
    const sumaPopusta = input.allowanceCharges ? input.allowanceCharges.filter(ac => !ac.chargeIndicator).reduce((acc, ac) => acc + ac.amount, 0) : 0;
    return Math.abs((input.allowanceTotalAmount || 0) - sumaPopusta) < 0.01;
  }, '[FATAL] Nesklad u totalima: Krovno polje allowanceTotalAmount mora biti tačan zbir svih detaljnih stavki popusta.'),

  v.check((input) => {
    const sumaTroskova = input.allowanceCharges ? input.allowanceCharges.filter(ac => ac.chargeIndicator).reduce((acc, ac) => acc + ac.amount, 0) : 0;
    return Math.abs((input.chargeTotalAmount || 0) - sumaTroskova) < 0.01;
  }, '[FATAL] Nesklad u totalima: Krovno polje chargeTotalAmount mora biti tačan zbir svih detaljnih stavki dodatnih troškova.'),

  // Poreska valuta
  v.check((input) => input.taxCurrencyCode === 'RSD', '[FATAL] Poreska anomalija: Prema Zakonu o eFakturisanju u Srbiji, poreska valuta (taxCurrencyCode) mora biti striktno postavljena na "RSD".'),

  v.check((input) => {
    const sumaPoreskihOsnovica = input.taxTotals.reduce((totalAcc, total) => {
      return totalAcc + total.subtotals.reduce((subAcc, sub) => subAcc + sub.taxableAmount, 0);
    }, 0);
    return Math.abs(input.taxExclusiveAmount - sumaPoreskihOsnovica) < 0.01;
  }, '[FATAL] Nesklad u totalima [VRBL-CALC-24]: Zbir svih osnovica unutar poreskih grupa (TaxSubtotal) se ne poklapa sa krajnjom osnovicom dokumenta (taxExclusiveAmount). Popusti ili troškovi nisu pravilno raspoređeni.')
);

export type SefInvoiceInput = v.InferOutput<typeof SefInvoiceSchema>;
