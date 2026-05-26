import * as v from 'valibot';

const toCent = (num: number) => Math.round(num * 100);

// Zvanični SEF poreski kodovi za Republiku Srbiju
export const SefTaxCategoryPicklist = v.picklist(
  ['S', 'AE', 'Z', 'E', 'R', 'O', 'OE'],
  '[FATAL] SEF-TAX: Nevalidna poreska kategorija. Dozvoljene oznake su S, AE, Z, E, R, O ili OE.'
);

// Standardizovane logističke jedinice mera (UN/ECE Rec 20)
export const SefUnitOfMeasurePicklist = v.picklist(
  ['LTR', 'KGM', 'HUR', 'H87', 'NAR'],
  '[FATAL] SEF-LOG: Nevalidna jedinica mere. Koristite standardne UN/ECE kodove (npr. LTR za litar, HUR za sat).'
);

export const SefInvoiceSchema = v.pipe(
  v.object({
    customizationId: v.literal('urn:cen.eu:en16931:2017#compliant#pi-rs:2024', '[FATAL] Nevalidan CustomizationID. Mora biti zvanični srpski profil (pi-rs:2024).'),
    profileId: v.literal('urn:fdc:peppol.eu:poacc:bis3:invoice:3', '[FATAL] Nevalidan ProfileID. Mora biti zvanični Peppol BIS3 profil.'),
    routingDetails: v.object({
      sender: v.string(),
      receiver: v.string(),
      documentScheme: v.literal('RS_E_INVOICING'),
      routingChannel: v.picklist(['PRODUCTION', 'SANDBOX'])
    }),
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

    // 🟢 Logistika i prevoz
    carrierParty: v.optional(SefCarrierPartySchema),

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
    invoiceLines: v.array(v.object({
      id: v.pipe(v.string(), v.minLength(1)),
      name: v.string(),
      invoicedQuantity: v.number(),
      unitCode: SefUnitOfMeasurePicklist,
      priceAmount: v.number(),
      lineExtensionAmount: v.number(),
      classifiedTaxCategory: v.object({
        taxCategoryCode: SefTaxCategoryPicklist,
        taxCategoryPercent: v.number()
      })
    }), [v.minLength(1, '[FATAL] Faktura mora sadržati najmanje jednu stavku (InvoiceLine).')])
  }),

  // Hronologija datuma
  v.check((input) => new Date(input.issueDate) <= new Date(input.paymentDueDate), '[FATAL] Rok plaćanja ne može biti pre datuma izdavanja fakture.'),

  // Mandatory Exemption Reason for 0% tax
  v.check((input) => {
    for (const sub of input.taxTotals.flatMap(t => t.subtotals)) {
      if (sub.taxCategoryPercent === 0 && !sub.exemptionReasonCode && !sub.taxExemptionReason) {
        return false;
      }
    }
    return true;
  }, '[FATAL] Zakonska greška: Za sve poreske grupe sa stopom 0% (AE, Z, E, O, OE) morate uneti šifru (exemptionReasonCode) ili tekstualni opis razloga za oslobođenje od PDV-a.')
);
