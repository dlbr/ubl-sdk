import * as v from 'valibot';

export const IsoCurrencySchema = v.pipe(
  v.string(),
  v.check((val: any) => val.length === 3, 'Oznaka valute mora imati tačno 3 karaktera')
);

export const SefInvoicePeriodSchema = v.pipe(
  v.object({
    startDate: v.pipe(v.string(), v.isoDate()),
    endDate: v.pipe(v.string(), v.isoDate())
  }),
  v.check((input: any) => new Date(input.endDate) >= new Date(input.startDate), 'Datum završetka perioda (endDate) ne može biti stariji')
);

export const TaxTotalSchema = v.pipe(
  v.object({
    taxAmount: v.optional(v.number(), 0),
    taxSchemeId: v.optional(v.string(), 'VAT'),
    subtotals: v.optional(v.array(v.object({
      taxableAmount: v.number(),
      taxAmount: v.number(),
      taxCategoryCode: v.string(),
      taxCategoryPercent: v.optional(v.number(), 20),
      taxExemptionReason: v.optional(v.string())
    })), [])
  }),
  v.check((input: any) => input.taxSchemeId === 'VAT', 'Krovna poreska shema (TaxScheme ID) mora biti postavljena na "VAT"'),
  v.check((input: any) => (input.subtotals || []).length > 0, 'Poreski blok mora sadržati najmanje jedan TaxSubtotal čvor')
);

// ─────────────────────────────────────────────────────────────────────────────
// validanPIB — Srpski PIB checksum (mod-11, Poreska uprava Srbije)
//
// PIB je UVEK tačno 9 cifara za sva pravna lica i preduzetnike u SEF sistemu.
// Oba učesnika (prodavac i kupac) moraju biti registrovani u Srbiji → 9 cifara, obavezno.
//
// Algoritam: suma = 10, for i in 0..7: suma = (suma+d[i])%10; suma=(suma||10)*2%11
// kontrolna = (11 - suma) % 10
//
// Izvor: https://mladsoft.com/2019/06/04/validacija-pib-mb-i-dr/
// ─────────────────────────────────────────────────────────────────────────────
export function validanPIB(pib: string): boolean {
  // Tačno 9 cifara — bez kompromisa
  if (!/^\d{9}$/.test(pib)) return false;
  let suma = 10;
  for (let i = 0; i < 8; i++) {
    suma = (suma + parseInt(pib[i], 10)) % 10;
    suma = (suma === 0 ? 10 : suma) * 2 % 11;
  }
  return parseInt(pib[8], 10) === (11 - suma) % 10;
}

// ─────────────────────────────────────────────────────────────────────────────
// validanMB — Matični broj pravnog lica / preduzetnika (mod-11, APR Srbija)
//
// Algoritam: weighted sum od desna ulevo, množilac ciklus 2→3→4→5→6→7→2...
// kb = 11 - (suma % 11); if kb > 9: kb = 0 (i 10 i 11 → 0)
// Uvek tačno 8 cifara, poslednja je kontrolna.
//
// Izvor: https://mladsoft.com/2019/06/04/validacija-pib-mb-i-dr/
// ─────────────────────────────────────────────────────────────────────────────
export function validanMB(mb: string): boolean {
  if (mb.length !== 8 || !/^\d{8}$/.test(mb)) return false;
  let kb = 0;
  let mnozilac = 2;
  for (let i = 6; i >= 0; i--) {
    kb += parseInt(mb[i], 10) * mnozilac;
    mnozilac = mnozilac === 7 ? 2 : mnozilac + 1;
  }
  const kontrolna = (11 - (kb % 11)) > 9 ? 0 : (11 - (kb % 11));
  return parseInt(mb[7], 10) === kontrolna;
}

// ─────────────────────────────────────────────────────────────────────────────
// normalizeAliases — THIN ALIAS RESOLVER (schema transform only)
//
// Maps alternative field names to canonical SEF/UBL names.
// DOES NOT compute, derive, or correct any financial amounts.
// If you're tempted to add math here — stop. Put it in normalizeInput().
// ─────────────────────────────────────────────────────────────────────────────
export function normalizeAliases(input: any): any {
  if (!input) return input;
  const o = { ...input };

  // ID / broj fakture
  o.id = input.id ?? input.invoiceId ?? input.broj ?? input.ID;

  // Datumi
  o.issueDate = input.issueDate ?? input.datumIzdavanja ?? input.datum ?? input.IssueDate ?? new Date().toISOString().split('T')[0];
  // NOTE: paymentDueDate intentionally has NO default — avans (386) validator checks its absence
  o.paymentDueDate = input.paymentDueDate ?? input.datumUplate ?? input.datumDospeca ?? input.paymentDate ?? input.DueDate;
  o.deliveryDate = input.deliveryDate ?? input.datumPrometa ?? input.ActualDeliveryDate ?? input.datumIsporuke;

  // Tip dokumenta
  o.invoiceTypeCode = input.invoiceTypeCode ?? input.tipDokumenta ?? input.InvoiceTypeCode ?? '380';

  // Valuta
  o.documentCurrencyCode = input.documentCurrencyCode ?? input.valuta ?? input.DocumentCurrencyCode ?? 'RSD';
  o.taxCurrencyCode = input.taxCurrencyCode ?? 'RSD';

  // PIB prodavca — strip RS prefix; zero-pad to 9 ONLY when resolving from ERP alias
  // If pibS is already the canonical field, keep it as-is (EU PIBs can be 8 digits)
  if (input.pibS != null) {
    o.pibS = String(input.pibS).replace(/^RS/, '');
  } else {
    const rawPibS = input.supplierPib ?? input.pibProdavca
      ?? input.seller?.pib ?? input.Supplier?.Pib ?? input.Supplier?.pib ?? input.supplier?.pib;
    if (rawPibS != null) o.pibS = String(rawPibS).replace(/^RS/, '').padStart(9, '0');
  }

  // PIB kupca
  if (input.pibB != null) {
    o.pibB = String(input.pibB).replace(/^RS/, '');
  } else {
    const rawPibB = input.customerPib ?? input.pibKupca
      ?? input.buyer?.pib ?? input.Customer?.Pib ?? input.Customer?.pib ?? input.customer?.pib;
    if (rawPibB != null) o.pibB = String(rawPibB).replace(/^RS/, '').padStart(9, '0');
  }

  // JBKJS
  o.jbkjsB = input.jbkjsB ?? input.customerJbkjs ?? input.jbkjs;

  // Prevoznik
  o.carrierPib = input.carrierPib ?? input.carrierParty?.carrierPib ?? input.carrierParty?.pib;

  // specificationId / customizationId
  o.specificationId = input.specificationId ?? input.customizationId;

  // Smer dokumenta
  o.smerDokumenta = input.smerDokumenta ?? input.documentDirection ?? 'POZITIVAN';

  // invoicePeriod iz flat polja
  if (!o.invoicePeriod && input.periodOd) {
    o.invoicePeriod = { startDate: input.periodOd, endDate: input.periodDo ?? input.periodOd };
  }

  // billingReference iz flat polja (referentni račun / avans)
  if (!o.billingReference && (input.referentniRacun || input.avansBroj || input.originalnaFakturaBroj)) {
    o.billingReference = {
      id: input.referentniRacun ?? input.avansBroj ?? input.originalnaFakturaBroj,
      date: input.datumReferentnog ?? input.avansDatum ?? input.originalniDatum ?? o.issueDate,
      issueDate: input.datumReferentnog ?? input.avansDatum ?? input.originalniDatum ?? o.issueDate,
      typeCode: input.tipReferentnogDokumenta ?? (input.avansBroj ? '386' : '380')
    };
  }

  // taxTotals alias (TaxTotals → taxTotals)
  if (!o.taxTotals && input.TaxTotals) o.taxTotals = input.TaxTotals;

  // invoiceLines alias (lines / Lines → invoiceLines)
  if (!o.invoiceLines && (input.lines || input.Lines)) o.invoiceLines = input.lines ?? input.Lines;

  // advancePaymentReferences iz avansneReference
  if (!o.advancePaymentReferences && input.avansneReference) {
    o.advancePaymentReferences = input.avansneReference.map((ref: any) => ({
      id: ref.brojAvansnogRacuna,
      uuid: ref.idSefAvansa,
      amount: ref.iznosUmanjenja,
      schemeId: 'SRB:ADVANCE'
    }));
  }

  return o;
}

// ─────────────────────────────────────────────────────────────────────────────
// SefInvoiceSchema — PURE VALIDATION
//
// The schema transform does ONLY alias resolution (normalizeAliases).
// All SEF-CALC checks run on the actual values provided by the caller.
// If a caller sends bad math, the check will catch it. Period.
// ─────────────────────────────────────────────────────────────────────────────
export const SefInvoiceSchema = v.pipe(
  v.object({
    id: v.optional(v.string()),
    invoiceId: v.optional(v.string()),
    broj: v.optional(v.string()),
    ID: v.optional(v.string()),

    specificationId: v.optional(v.string()),
    localProfileSpecificationId: v.optional(v.string()),
    carrierParty: v.optional(v.any()),
    carrierPib: v.optional(v.string()),

    issueDate: v.optional(v.string()),
    datumIzdavanja: v.optional(v.string()),
    datum: v.optional(v.string()),
    IssueDate: v.optional(v.string()),

    paymentDueDate: v.optional(v.string()),
    datumUplate: v.optional(v.string()),
    datumDospeca: v.optional(v.string()),
    paymentDate: v.optional(v.string()),
    DueDate: v.optional(v.string()),

    deliveryDate: v.optional(v.string()),
    datumPrometa: v.optional(v.string()),
    ActualDeliveryDate: v.optional(v.string()),
    datumIsporuke: v.optional(v.string()),

    issueTime: v.optional(v.string()),

    invoiceTypeCode: v.optional(v.string()),
    tipDokumenta: v.optional(v.string()),
    InvoiceTypeCode: v.optional(v.string()),
    TipZapisa: v.optional(v.string()),

    documentCurrencyCode: v.optional(v.string()),
    valuta: v.optional(v.string()),
    DocumentCurrencyCode: v.optional(v.string()),
    taxCurrencyCode: v.optional(v.string()),

    pibS: v.optional(v.string()),
    supplierPib: v.optional(v.string()),
    pibProdavca: v.optional(v.string()),
    seller: v.optional(v.any()),
    Supplier: v.optional(v.any()),
    maticniBrojS: v.optional(v.string()),

    pibB: v.optional(v.string()),
    customerPib: v.optional(v.string()),
    pibKupca: v.optional(v.string()),
    buyer: v.optional(v.any()),
    Customer: v.optional(v.any()),
    maticniBrojB: v.optional(v.string()),

    jbkjsB: v.optional(v.string()),
    customerJbkjs: v.optional(v.string()),
    jbkjs: v.optional(v.string()),
    buyerReference: v.optional(v.any()),

    supplierPartyIdentification: v.optional(v.any()),
    supplierPartyTaxScheme: v.optional(v.any()),
    supplierPartyLegalEntity: v.optional(v.any()),
    supplierElectronicAddress: v.optional(v.any()),
    customerElectronicAddress: v.optional(v.any()),
    customerPartyTaxScheme: v.optional(v.any()),
    customerPartyLegalEntity: v.optional(v.any()),

    payableAmount: v.optional(v.number()),
    lineExtensionAmount: v.optional(v.number()),
    taxExclusiveAmount: v.optional(v.number()),
    taxInclusiveAmount: v.optional(v.number()),
    allowanceTotalAmount: v.optional(v.number()),
    chargeTotalAmount: v.optional(v.number()),
    prepaidAmount: v.optional(v.number()),
    taxAmount: v.optional(v.number()),

    taxTotals: v.optional(v.array(TaxTotalSchema)),
    taxSubtotals: v.optional(v.array(v.any())),
    invoiceLines: v.optional(v.array(v.any())),
    allowanceCharges: v.optional(v.array(v.any())),

    billingReference: v.optional(v.any()),
    prepaymentReference: v.optional(v.any()),
    referentniRacun: v.optional(v.string()),
    datumReferentnog: v.optional(v.string()),
    avansBroj: v.optional(v.string()),
    avansDatum: v.optional(v.string()),
    invoicePeriod: v.optional(SefInvoicePeriodSchema),
    notes: v.optional(v.array(v.string())),
    pfrBrojevi: v.optional(v.array(v.string())),
    customizationId: v.optional(v.string()),
    businessProcessType: v.optional(v.string()),
    tenderDocumentReference: v.optional(v.any()),
    contractDocumentReference: v.optional(v.any()),

    advancePaymentReferences: v.optional(v.array(v.any())),
    avansneReference: v.optional(v.array(v.any())),
    despatchDocumentReferences: v.optional(v.array(v.any())),

    smerDokumenta: v.optional(v.string()),
    documentDirection: v.optional(v.string()),

    Lines: v.optional(v.array(v.any())),
    lines: v.optional(v.array(v.any())),
    TaxTotals: v.optional(v.array(v.any())),
    LegalMonetaryTotal: v.optional(v.any())
  }),

  // ── THIN TRANSFORM: alias resolution only, zero math ──
  v.transform(normalizeAliases),

  // 1. Valuta
  v.check((input: any) => {
    if (input.documentCurrencyCode && input.documentCurrencyCode.length !== 3) return false;
    return true;
  }, 'Oznaka valute mora imati tačno 3 karaktera'),

  // 2. PIB — kriptografski checksum (Luhn mod-11 algoritam Poreske uprave Srbije)
  //
  // Algoritam (samo za 9-cifrene PIB-ove, srpski format):
  //   suma = 10
  //   for i in 0..7: suma = (suma + digit[i]) % 10; suma = (suma || 10) * 2 % 11
  //   kontrolna = (11 - suma) % 10
  //   valid = digit[8] == kontrolna
  //
  // 2. PIB — striktno 9 cifara + obavezan mod-11 checksum
  // SEF sistem: oba učesnika su registrovani u Srbiji → nema EU/stranih izuzetaka.
  v.check((input: any) => {
    if (input.pibS && !validanPIB(input.pibS)) return false;
    if (input.pibB && !validanPIB(input.pibB)) return false;
    return true;
  }, 'PIB mora biti tačno 9 cifara i kriptografski ispravan (srpski mod-11 checksum)'),

  // 2b. Matični broj (MB) — APR mod-11 checksum
  // Proveravamo samo ako je dostupan u seller/buyer objektima ili kao flat polje.
  // MB je uvek tačno 8 cifara; svi drugi formati se odbijaju.
  v.check((input: any) => {
    const mbS = input.seller?.maticniBroj ?? input.maticniBrojS;
    const mbB = input.buyer?.maticniBroj ?? input.maticniBrojB;
    if (mbS && !validanMB(String(mbS))) return false;
    if (mbB && !validanMB(String(mbB))) return false;
    return true;
  }, 'Matični broj mora imati tačno 8 cifara i biti kriptografski ispravan (APR mod-11 checksum)'),

  // 3. JBKJS
  v.check((input: any) => {
    if (input.jbkjsB && !/^\d{5}$/.test(input.jbkjsB)) return false;
    return true;
  }, 'JBKJS mora sadržati tačno 5 numeričkih karaktera'),

  // 3.5. Advance Payment schemeId
  v.check((input: any) => {
    if (input.advancePaymentReferences) {
      for (const ref of input.advancePaymentReferences) {
        if (ref.schemeId !== 'SRB:ADVANCE') return false;
      }
    }
    return true;
  }, 'schemeID za avansnu referencu unutar OriginatorDocumentReference mora biti "SRB:ADVANCE"'),

  v.check((input: any) => {
    if (input.invoiceTypeCode !== '380' && input.advancePaymentReferences && input.advancePaymentReferences.length > 0) return false;
    return true;
  }, 'se mogu nalaziti isključivo unutar Konačne Fakture (tip 380)'),

  // 4. BillingReference za 381 i 386
  v.check((input: any) => {
    if (input.invoiceTypeCode === '381') {
      const hasRef = !!(input.billingReference?.id || input.billingReference?.invoiceId);
      const hasPeriod = !!(input.invoicePeriod?.startDate && input.invoicePeriod?.endDate);
      if (!hasRef && !hasPeriod) return false;
    }
    return true;
  }, 'Knjižno odobrenje (381) mora sadržati BillingReference'),

  // NOTE: 386 (avans) does NOT require billingReference — it creates a payment reference, not a correction

  // 5. Datum valjanosti
  v.check((input: any) => {
    if (input.issueDate && input.paymentDueDate) {
      return new Date(input.issueDate) <= new Date(input.paymentDueDate);
    }
    return true;
  }, 'Rok plaćanja ne može biti pre datuma izdavanja'),

  // 6. Devizna — taxCurrencyCode mora biti RSD
  v.check((input: any) => {
    if (input.documentCurrencyCode && input.documentCurrencyCode !== 'RSD') {
      if (input.taxCurrencyCode && input.taxCurrencyCode !== 'RSD') return false;
    }
    return true;
  }, 'poreska valuta (taxCurrencyCode) mora biti striktno postavljena na "RSD"'),

  // Devizne fakture moraju imati ≥2 TaxTotal bloka
  v.check((input: any) => {
    if (input.documentCurrencyCode && input.documentCurrencyCode !== 'RSD') {
      if ((input.taxTotals || []).length < 2) return false;
    }
    return true;
  }, 'Devizne fakture moraju sadržati tačno dva TaxTotal bloka'),

  // 7. Budžetski korisnici
  v.check((input: any) => {
    if (input.jbkjsB && !input.buyerReference && !input.billingReference) return false;
    return true;
  }, 'Za budžetske korisnike (kupce sa JBKJS brojem), obavezno je uneti BuyerReference'),

  // 8. Vreme
  v.check((input: any) => {
    if (input.issueTime && !/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.test(input.issueTime)) return false;
    return true;
  }, 'formatu hh:mm:ss'),

  // 9. ID ne sme biti prazan string
  v.check((input: any) => {
    if (input.id === '') return false;
    return true;
  }, 'Broj fakture (invoiceId) ne sme biti prazan'),

  // 10. Reverse Charge (AE) — obavezan osnov
  v.check((input: any) => {
    const subtotals = input.taxSubtotals || (input.taxTotals && input.taxTotals[0]?.subtotals) || [];
    for (const s of subtotals) {
      const code = s.taxCategoryCode || '';
      if (code.startsWith('AE')) {
        if (!s.taxExemptionReason && (!input.notes || input.notes.length === 0)) return false;
      }
    }
    return true;
  }, 'Za Reverse Charge (AE) obavezno je navesti zakonski osnov'),

  // 11. Business context
  v.check((input: any) => {
    if (input.businessProcessType && input.businessProcessType !== 'COMMERCIAL_INVOICING') return false;
    return true;
  }, 'businessProcessType mora biti striktno postavljen na "COMMERCIAL_INVOICING"'),

  // 12. BuyerReference dužina
  v.check((input: any) => {
    if (input.buyerReference && typeof input.buyerReference === 'string' && input.buyerReference.length > 50) return false;
    return true;
  }, 'BuyerReference ne sme biti duži od 50 karaktera.'),

  // 13. SpecificationID
  v.check((input: any) => {
    const specId = input.specificationId;
    if (specId && !specId.includes('urn:')) return false;
    return true;
  }, 'SpecificationID mora biti validan URN'),

  v.check((input: any) => {
    const specId = input.specificationId;
    if (specId && specId !== 'urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.rs:srbdt:2.1' && specId.includes('spec')) {
      if (specId !== 'urn:vertexinc:vrbl:spec:core:1') return false;
    }
    return true;
  }, 'SpecificationID mora biti "urn:vertexinc:vrbl:spec:core:1"'),

  // ─── SEF-CALC: Arithmetic validation ─────────────────────────────────────
  // These checks operate on the ACTUAL values in the payload.
  // If you send wrong math, this is where it breaks. That is by design.
  // ─────────────────────────────────────────────────────────────────────────

  // SEF-CALC-10 FIRST: taxExclusiveAmount = suma taxableAmount iz subtotals (RSD only)
  // Must precede SEF-CALC-1 so the more specific error message fires first.
  v.check((input: any) => {
    if (input.documentCurrencyCode && input.documentCurrencyCode !== 'RSD') return true;
    const subtotals = input.taxSubtotals || (input.taxTotals && input.taxTotals[0]?.subtotals) || [];
    if (subtotals.length === 0) return true;
    if (input.taxExclusiveAmount === undefined) return true;
    let sum = 0;
    for (const s of subtotals) sum += s.taxableAmount || 0;
    if (Math.abs(input.taxExclusiveAmount - sum) > 0.01) return false;
    return true;
  }, 'Aritmetička greška [SEF-CALC-10]'),

  // SEF-CALC-1 / SEF-CALC-5: taxExclusiveAmount = lineExtensionAmount - allowance + charge
  // SEF-CALC-8: lineExtensionAmount = sum of line amounts
  // Skip for foreign currency invoices (amounts are in different currencies)
  v.check((input: any) => {
    if (input.documentCurrencyCode && input.documentCurrencyCode !== 'RSD') return true;
    const exclusive = input.taxExclusiveAmount ?? null;
    const extension = input.lineExtensionAmount ?? null;
    const allowance = input.allowanceTotalAmount ?? 0;
    const charge = input.chargeTotalAmount ?? 0;

    if (exclusive !== null && extension !== null) {
      if (Math.abs(exclusive - (extension - allowance + charge)) > 0.02) return false;
    }

    // SEF-CALC-8: lineExtensionAmount vs sum of invoice lines
    if (extension !== null) {
      let linesSum = 0;
      for (const l of input.invoiceLines || []) {
        linesSum += (l.priceAmount ?? l.lineExtensionAmount ?? 0) * (l.invoicedQuantity ?? 1);
      }
      if (linesSum > 0 && Math.abs(extension - linesSum) > 0.02) return false;
    }

    return true;
  }, 'SEF-CALC-1'),

  // SEF-CALC-2: krovni taxAmount = suma taxAmount iz subtotals
  v.check((input: any) => {
    const subtotals = input.taxSubtotals || (input.taxTotals && input.taxTotals[0]?.subtotals) || [];
    if (subtotals.length > 0 && input.taxAmount !== undefined) {
      let sum = 0;
      for (const s of subtotals) sum += s.taxAmount ?? 0;
      if (Math.abs(input.taxAmount - sum) > 0.02) return false;
    }
    return true;
  }, 'SEF-CALC-2'),

  // SEF-CALC-3: taxInclusiveAmount = taxExclusiveAmount + taxAmount (RSD only)
  // For foreign currency: amounts in header are in foreign currency, taxTotals may be in RSD — not comparable
  v.check((input: any) => {
    if (input.documentCurrencyCode && input.documentCurrencyCode !== 'RSD') return true;
    const inclusive = input.taxInclusiveAmount;
    const exclusive = input.taxExclusiveAmount;
    const tax = input.taxAmount;
    if (inclusive !== undefined && exclusive !== undefined && tax !== undefined) {
      if (Math.abs(inclusive - (exclusive + tax)) > 0.02) return false;
    }
    return true;
  }, 'SEF-CALC-3'),

  // SEF-CALC-4: granularna osnova unutar grupe = suma linija po kategoriji - popusti + troškovi
  v.check((input: any) => {
    const subtotals = input.taxSubtotals || (input.taxTotals && input.taxTotals[0]?.subtotals) || [];
    if (subtotals.length > 0 && (input.invoiceLines || []).length > 0) {
      const categories: Record<string, number> = {};
      for (const l of input.invoiceLines || []) {
        const cat = (l.taxCategoryCode || 'S').startsWith('S') ? 'S' : (l.taxCategoryCode || 'S').startsWith('AE') ? 'AE' : (l.taxCategoryCode || 'S');
        categories[cat] = (categories[cat] || 0) + (l.priceAmount ?? l.lineExtensionAmount ?? 0) * (l.invoicedQuantity ?? 1);
      }
      for (const s of subtotals) {
        const cat = (s.taxCategoryCode || 'S').startsWith('S') ? 'S' : (s.taxCategoryCode || 'S').startsWith('AE') ? 'AE' : (s.taxCategoryCode || 'S');
        if (categories[cat] !== undefined) {
          const expectedBase = categories[cat] - (input.allowanceTotalAmount ?? 0) + (input.chargeTotalAmount ?? 0);
          if (Math.abs((s.taxableAmount ?? 0) - expectedBase) > 0.02) return false;
        }
      }
    }
    return true;
  }, 'SEF-CALC-4'),

  // SEF-CALC-6: payableAmount = taxInclusiveAmount - prepaidAmount
  v.check((input: any) => {
    if (input.prepaidAmount !== undefined && input.prepaidAmount !== 0 &&
        input.taxInclusiveAmount !== undefined && input.payableAmount !== undefined) {
      if (Math.abs(input.payableAmount - (input.taxInclusiveAmount - input.prepaidAmount)) > 0.01) return false;
    }
    return true;
  }, 'SEF-CALC-6'),

  // SEF-CALC-10 duplicate removed — moved before SEF-CALC-1 above for correct error ordering

  // 15. Prevoznik — RS prefiks
  v.check((input: any) => {
    if (input.carrierPib && !input.carrierPib.startsWith('RS')) return false;
    return true;
  }, 'PIB prevoznika mora biti u ispravnom formatu sa prefiksom "RS"'),

  // 16. Prevoznik ≠ prodavac
  v.check((input: any) => {
    if (input.pibS && input.carrierPib) {
      const cleanPibS = input.pibS.replace(/^RS/, '');
      const cleanCarrierPib = input.carrierPib.replace(/^RS/, '');
      if (cleanPibS === cleanCarrierPib) return false;
    }
    return true;
  }, 'PIB eksternog prevoznika (carrierPib) ne može biti identičan PIB-u dobavljača'),

  // 17. Tender / Lot
  v.check((input: any) => {
    if (input.tenderDocumentReference?.documentTypeCode && input.tenderDocumentReference.documentTypeCode !== '50') return false;
    return true;
  }, 'DocumentTypeCode unutar tenderske reference mora biti striktno postavljen na "50"'),

  v.check((input: any) => {
    if (input.contractDocumentReference?.id === '') return false;
    return true;
  }, 'ID ugovora/partije ne sme biti prazan'),

  // 18. Obračunski period ne sme biti u budućnosti
  v.check((input: any) => {
    if (input.invoicePeriod?.endDate && input.issueDate) {
      return new Date(input.invoicePeriod.endDate) <= new Date(input.issueDate);
    }
    return true;
  }, 'Obračunski period se ne može završavati u budućnosti u odnosu na datum izdavanja'),

  // 19. BillingReference datum
  v.check((input: any) => {
    if (input.invoiceTypeCode === '381' && input.billingReference) {
      if (typeof input.billingReference === 'object') {
        const dateStr = input.billingReference.issueDate || input.billingReference.date;
        if (!dateStr || isNaN(Date.parse(dateStr))) return false;
      }
    }
    return true;
  }, 'BillingReference mora sadržati datum izdavanja originalne fakture'),

  v.check((input: any) => {
    if (input.supplierPartyIdentification?.schemeId && input.supplierPartyIdentification.schemeId !== 'SRB:PIB') return false;
    return true;
  }, 'schemeID za poresku identifikaciju prodavca mora biti "SRB:PIB"'),

  v.check((input: any) => {
    const value = input.supplierPartyIdentification?.value;
    if (input.pibS && value && input.pibS !== value) return false;
    return true;
  }, 'identična glavnom PIB-u prodavca'),

  v.check((input: any) => {
    const taxSchemeId = input.supplierPartyTaxScheme?.taxSchemeId;
    if (taxSchemeId && !['VAT', 'TAX'].includes(taxSchemeId)) return false;
    return true;
  }, 'mora biti postavljena na "VAT" ili "TAX"'),

  // 20. Negativni iznos — dozvoljeno samo za storno / credit note
  v.check((input: any) => {
    const amount = input.payableAmount ?? input.taxInclusiveAmount ?? 0;
    if (amount < 0 && input.smerDokumenta !== 'NEGATIVAN' && input.invoiceTypeCode !== '381' && !input.prepaidAmount) {
      return false;
    }
    return true;
  }, 'Iznos ne može biti negativan'),

  // 21. Avansni račun (386) mora imati datum uplate
  v.check((input: any) => {
    if (input.invoiceTypeCode === '386' && !input.paymentDueDate) return false;
    return true;
  }, 'Avans zahteva datum uplate')
);

// ─────────────────────────────────────────────────────────────────────────────
// MasterValidator — validates ERP/integration payloads
//
// Flow: normalize field aliases → compute missing amounts → validate schema
// This is the ONLY place where normalizeInput (full math) is called.
// ─────────────────────────────────────────────────────────────────────────────
export class MasterValidator {
  static validate(data: any) {
    if (!data) {
      throw new Error(`🛡️ [MasterValidator] FATAL: Nedostaju obavezna polja`);
    }

    // Step 1: Normalize aliases + compute missing financial amounts
    const normalized = normalizeInput(data);

    // Step 2: Require core fields after normalization
    if (!normalized.id || !normalized.issueDate || !normalized.pibS || !normalized.pibB) {
      throw new Error(`🛡️ [MasterValidator] FATAL: Nedostaju obavezna polja`);
    }

    // Step 3: Validate against the pure schema
    const result = v.safeParse(SefInvoiceSchema, normalized);
    if (!result.success) {
      console.error('🛡️ [MasterValidator] CONTRACT VIOLATION:', JSON.stringify(result.issues, null, 2));
      throw new Error(`🛡️ [MasterValidator] FATAL: Payload ne prati SEF standard: ${result.issues[0].message}`);
    }
    return result.output;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// normalizeInput — FULL NORMALIZATION (MasterValidator use only)
//
// Called BEFORE schema validation when handling ERP/integration payloads.
// Computes all missing financial amounts from whatever the ERP sends.
// NEVER called inside SefInvoiceSchema itself.
// ─────────────────────────────────────────────────────────────────────────────
export function normalizeInput(input: any): any {
  if (!input) return input;

  // Start with alias resolution
  const output = normalizeAliases(input);

  // issueDate fallback: today if nothing provided
  if (!output.issueDate) {
    output.issueDate = new Date().toISOString().split('T')[0];
  }

  // paymentDueDate: default to issueDate for non-386 invoices
  if (!output.paymentDueDate && output.invoiceTypeCode !== '386') {
    output.paymentDueDate = output.issueDate;
  }

  // Normalizujemo stavke (invoiceLines)
  const rawLines = input.invoiceLines ?? input.lines ?? input.Lines;
  if (!rawLines || rawLines.length === 0) {
    let osnovica = parseFloat(
      input.osnovica ??
      input.iznosZaSmanjenjeOsnovice ??
      input.iznosSmanjenjaOsnovice ??
      input.iznosZaPovecanjeOsnovice ??
      input.iznos ??
      input.ukupnaOsnovica ??
      input.taxExclusiveAmount ??
      input.LegalMonetaryTotal?.TaxExclusiveAmount ??
      0
    );
    if (input.ukupnaOsnovica && input.odbitakAvansaSaPdv) {
      const odbitak = parseFloat(input.odbitakAvansaSaPdv);
      osnovica = parseFloat(input.ukupnaOsnovica) - (odbitak / 1.2);
    }
    const stopa = parseFloat(input.pdvStopa || 20);
    const poreskaKategorija = input.poreskaKategorija ?? 'S';

    output.invoiceLines = [{
      id: '1',
      name: input.item_name ?? input.razlog ?? 'Usluge',
      invoicedQuantity: 1,
      unitCode: 'H87',
      priceAmount: input.ukupnaOsnovica ? parseFloat(input.ukupnaOsnovica) : osnovica,
      taxCategoryPercent: stopa,
      taxCategoryCode: poreskaKategorija,
      taxExemptionReason: input.sifraOslobodjenja
    }];

    if (input.avansBroj && input.odbitakAvansaSaPdv) {
      const odbitak = parseFloat(input.odbitakAvansaSaPdv);
      const netoOdbitka = odbitak / 1.2;
      output.invoiceLines.push({
        id: 'AVANS-REDUKCIJA',
        name: 'Umanjenje po avansu',
        invoicedQuantity: -1,
        unitCode: 'H87',
        priceAmount: netoOdbitka,
        taxCategoryPercent: 20,
        taxCategoryCode: 'S'
      });
    }
  } else {
    output.invoiceLines = rawLines.map((l: any, idx: number) => ({
      id: l.id ?? l.ID ?? String(idx + 1),
      name: l.name ?? l.description ?? l.ItemName ?? l.itemName ?? 'Stavka',
      invoicedQuantity: parseFloat(l.invoicedQuantity ?? l.quantity ?? l.Quantity ?? l.DeliveredQuantity ?? 1),
      unitCode: l.unitCode ?? l.UnitCode ?? 'H87',
      priceAmount: parseFloat(l.priceAmount ?? l.unitPrice ?? l.PriceAmount ?? l.UnitPrice ?? l.price ?? l.Price ?? l.lineExtensionAmount ?? l.LineExtensionAmount ?? 0),
      taxCategoryPercent: parseFloat(l.taxCategoryPercent || l.taxRate || l.TaxRate || l.VatPercent || l.vatPercent || 20),
      taxCategoryCode: l.taxCategoryCode ?? l.taxCategory ?? l.TaxCategory ?? l.VatCategory ?? l.vatCategory ?? 'S',
      taxExemptionReason: l.taxExemptionReason ?? l.TaxExemptionReasonCode ?? l.sifraOslobodjenja
    }));
  }

  // Normalizujemo taxTotals
  const rawTaxTotals = input.taxTotals ?? input.TaxTotals;
  if (rawTaxTotals && rawTaxTotals.length > 0) {
    output.taxTotals = rawTaxTotals.map((t: any) => ({
      taxAmount: parseFloat(t.taxAmount ?? t.TaxAmount ?? 0),
      taxSchemeId: t.taxSchemeId ?? t.TaxSchemeId ?? 'VAT',
      subtotals: (t.subtotals ?? t.Subtotals ?? []).map((s: any) => ({
        taxableAmount: parseFloat(s.taxableAmount ?? s.TaxableAmount ?? 0),
        taxAmount: parseFloat(s.taxAmount ?? s.TaxAmount ?? 0),
        taxCategoryCode: s.taxCategoryCode ?? s.taxCategory ?? s.TaxCategory ?? s.Category ?? 'S',
        taxCategoryPercent: parseFloat(s.taxCategoryPercent || s.TaxCategoryPercent || s.Percent || 20),
        taxExemptionReason: s.taxExemptionReason ?? s.TaxExemptionReasonCode ?? input.sifraOslobodjenja
      }))
    }));
  } else {
    // Compute from flat amounts
    let osnovica = parseFloat(
      input.osnovica ??
      input.iznosZaSmanjenjeOsnovice ??
      input.iznosSmanjenjaOsnovice ??
      input.iznosZaPovecanjeOsnovice ??
      input.iznos ??
      input.ukupnaOsnovica ??
      input.taxExclusiveAmount ??
      input.LegalMonetaryTotal?.TaxExclusiveAmount ??
      0
    );
    if (input.ukupnaOsnovica && input.odbitakAvansaSaPdv) {
      const odbitak = parseFloat(input.odbitakAvansaSaPdv);
      osnovica = parseFloat(input.ukupnaOsnovica) - (odbitak / 1.2);
    }
    const pdv = parseFloat(
      input.pdv ??
      input.iznosZaSmanjenjePdv ??
      input.iznosSmanjenjaPdv ??
      input.iznosZaPovecanjePdv ??
      input.taxAmount ??
      0
    );
    const stopa = parseFloat(input.pdvStopa || 20);
    const poreskaKategorija = input.poreskaKategorija ?? 'S';

    output.taxTotals = [{
      taxAmount: pdv,
      taxSchemeId: 'VAT',
      subtotals: [{
        taxableAmount: osnovica,
        taxAmount: pdv,
        taxCategoryCode: poreskaKategorija,
        taxCategoryPercent: stopa,
        taxExemptionReason: input.sifraOslobodjenja
      }]
    }];
  }

  // Compute financial totals from taxTotals (single source of truth)
  const primarni = output.taxTotals[0];
  const pdv = primarni.taxAmount;
  const osnovica = primarni.subtotals.reduce((sum: number, s: any) => sum + s.taxableAmount, 0);
  const inclusive = osnovica + pdv;
  const prepaid = parseFloat(input.prepaidAmount ?? input.LegalMonetaryTotal?.PrepaidAmount ?? input.odbitakAvansaSaPdv ?? 0);
  const sign = output.smerDokumenta === 'NEGATIVAN' ? -1 : 1;

  output.taxExclusiveAmount = osnovica;
  output.taxAmount = pdv;
  output.taxInclusiveAmount = inclusive;
  output.lineExtensionAmount = osnovica;
  output.allowanceTotalAmount = parseFloat(input.allowanceTotalAmount ?? input.LegalMonetaryTotal?.AllowanceTotalAmount ?? 0);
  output.chargeTotalAmount = parseFloat(input.chargeTotalAmount ?? input.LegalMonetaryTotal?.ChargeTotalAmount ?? 0);
  output.prepaidAmount = prepaid;
  output.payableAmount = parseFloat(input.payableAmount ?? (inclusive * sign - prepaid));

  // Align single line priceAmount with computed lineExtensionAmount
  if (output.invoiceLines && output.invoiceLines.length === 1) {
    output.invoiceLines[0].priceAmount = output.lineExtensionAmount / (output.invoiceLines[0].invoicedQuantity || 1);
  }

  // For EUR/devizne invoices: build the required 2-block TaxTotal structure
  if (output.documentCurrencyCode && output.documentCurrencyCode !== 'RSD') {
    const firstBlock = output.taxTotals[0];
    if (output.taxTotals.length < 2) {
      output.taxTotals = [
        firstBlock,
        {
          taxAmount: firstBlock.taxAmount,
          taxSchemeId: 'VAT',
          subtotals: firstBlock.subtotals.map((s: any) => ({ ...s }))
        }
      ];
    }
  }

  // Parties
  const seller = input.seller ?? {};
  output.seller = {
    pib: output.pibS,
    name: seller.name ?? input.nazivProdavca ?? 'PRODAVAC',
    address: seller.address ?? input.adresaProdavca ?? 'Ulica',
    city: seller.city ?? input.gradProdavca ?? 'Grad',
    zip: seller.zip ?? input.postanskiBrojProdavca ?? '11000',
    maticniBroj: seller.maticniBroj ?? input.maticniBrojProdavca ?? '00000000',
    jbkjs: seller.jbkjs ?? input.jbkjsProdavca,
    bankAccount: seller.bankAccount ?? input.brojRacunaProdavca ?? '840-0000000000000-00'
  };

  const buyer = input.buyer ?? {};
  output.buyer = {
    pib: output.pibB,
    name: buyer.name ?? input.nazivKupca ?? 'KUPAC',
    address: buyer.address ?? input.adresaKupca ?? 'Ulica',
    city: buyer.city ?? input.gradKupca ?? 'Grad',
    zip: buyer.zip ?? input.postanskiBrojKupca ?? '11000',
    maticniBroj: buyer.maticniBroj ?? input.maticniBrojKupca ?? '00000000',
    jbkjs: buyer.jbkjs ?? output.jbkjsB
  };

  // prepaymentReference
  if (!output.prepaymentReference && (input.avansBroj || input.odbitakAvansaSaPdv || input.avansPdv || input.iznosSmanjenjaPdv)) {
    const odbitak = parseFloat(input.odbitakAvansaSaPdv ?? 0);
    const taxAmt = parseFloat(input.avansPdv ?? input.iznosSmanjenjaPdv ?? (odbitak > 0 ? (odbitak - (odbitak / 1.2)) : 0));
    output.prepaymentReference = {
      id: input.avansBroj ?? input.referentniRacun,
      taxAmount: taxAmt
    };
  }

  output.notes = input.notes ?? (input.note ? [input.note] : undefined) ?? input.Notes;
  output.pfrBrojevi = input.pfrBrojevi;

  return output;
}

export class SefLiveValidator {
  private static cache: Map<string, any> = new Map();
  static clearCache() { this.cache.clear(); }
  static async getLiveTaxRules(env: any): Promise<any> {
    const cached = this.cache.get('tax_rules');
    if (cached) return cached;
    if (env.PORESKI_KV) {
      const rules = await env.PORESKI_KV.get('live_tax_rules', { type: 'json' });
      if (rules) {
        this.cache.set('tax_rules', rules);
        return rules;
      }
    }
    return { DOZVOLJENE_KATEGORIJE: ["S", "E", "AE", "Z", "OE", "R", "G", "O", "N"] };
  }
}
