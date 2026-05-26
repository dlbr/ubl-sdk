import * as v from 'valibot';

const toCent = (num: number) => Math.round(num * 100);

export const SefInvoiceSchema = v.pipe(
  v.object({
    customizationId: v.literal('urn:vertexinc:vrbl:billing:1', '[FATAL] VRBL-CORE-4: CustomizationID mora biti "urn:vertexinc:vrbl:billing:1".'),
    profileId: v.literal('urn:vertexinc:vrbl:billing:1', '[FATAL] VRBL-CORE-5: ProfileID mora biti "urn:vertexinc:vrbl:billing:1".'),
    routingDetails: v.object({
      sender: v.string(),
      receiver: v.string()
    }),
    invoiceId: v.string(),
    invoiceTypeCode: v.string(),
    issueDate: v.string([v.isoDate()]),
    
    lineExtensionAmount: v.number(),
    allowanceTotalAmount: v.number(),
    chargeTotalAmount: v.number(),
    taxExclusiveAmount: v.number(),
    taxInclusiveAmount: v.number(),
    payableAmount: v.number(),
    prepaidAmount: v.optional(v.number(), 0),

    taxAmount: v.number(),

    invoiceLines: v.array(v.object({
      id: v.string(),
      lineExtensionAmount: v.number(),
      taxCategoryCode: v.string(),
      taxCategoryPercent: v.number()
    })),

    taxSubtotals: v.array(v.object({
      taxableAmount: v.number(),
      taxAmount: v.number(),
      taxCategoryCode: v.string(),
      taxCategoryPercent: v.number()
    })),

    allowanceCharges: v.optional(v.array(v.object({
      chargeIndicator: v.boolean(),
      amount: v.number(),
      taxCategoryCode: v.string(),
      taxCategoryPercent: v.number()
    })), [])
  }),

  v.check((input) => {
    const expectedCents = toCent(input.lineExtensionAmount) 
                          - toCent(input.allowanceTotalAmount) 
                          + toCent(input.chargeTotalAmount);
    return toCent(input.taxExclusiveAmount) === expectedCents;
  }, '[FATAL] [VRBL-CALC-1]: Krovna osnovica (taxExclusiveAmount) mora biti jednaka sumi stavki (lineExtensionAmount) minus popusti (allowanceTotalAmount) plus troškovi (chargeTotalAmount).'),

  v.check((input) => {
    const sumSubtotalTaxCents = input.taxSubtotals.reduce((acc, sub) => acc + toCent(sub.taxAmount), 0);
    return toCent(input.taxAmount) === sumSubtotalTaxCents;
  }, '[FATAL] [VRBL-CALC-2]: Krovni porez (taxAmount) mora biti jednak zbiru svih iznosa poreza unutar poreskih grupa (taxSubtotals).'),

  v.check((input) => {
    const expectedBrutoCents = toCent(input.taxExclusiveAmount) + toCent(input.taxAmount);
    return toCent(input.taxInclusiveAmount) === expectedBrutoCents;
  }, '[FATAL] [VRBL-CALC-3]: Krovni bruto iznos (taxInclusiveAmount) mora biti jednak zbiru krovne osnovice (taxExclusiveAmount) i krovnog poreza (taxAmount).'),

  v.check((input) => {
    for (const sub of input.taxSubtotals) {
      const linesCents = input.invoiceLines
        .filter(l => l.taxCategoryCode === sub.taxCategoryCode && l.taxCategoryPercent === sub.taxCategoryPercent)
        .reduce((acc, l) => acc + toCent(l.lineExtensionAmount), 0);

      const allowanceCents = input.allowanceCharges
        .filter(ac => !ac.chargeIndicator && ac.taxCategoryCode === sub.taxCategoryCode && ac.taxCategoryPercent === sub.taxCategoryPercent)
        .reduce((acc, ac) => acc + toCent(ac.amount), 0);

      const chargeCents = input.allowanceCharges
        .filter(ac => ac.chargeIndicator && ac.taxCategoryCode === sub.taxCategoryCode && ac.taxCategoryPercent === sub.taxCategoryPercent)
        .reduce((acc, ac) => acc + toCent(ac.amount), 0);

      const expectedTaxableCents = linesCents - allowanceCents + chargeCents;

      if (toCent(sub.taxableAmount) !== expectedTaxableCents) {
        return false;
      }
    }
    return true;
  }, '[FATAL] [VRBL-CALC-4]: Osnovica poreske grupe (TaxSubtotal/TaxableAmount) mora odgovarati zbiru neto vrednosti njenih stavki, umanjenom za pripadajuće krovne popuste i uvećanom za pripadajuće krovne troškove.')
);
