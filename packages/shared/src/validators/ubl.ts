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

  // 🎯 VRBL-CALC-5: TaxExclusiveAmount = LineExtensionAmount + ChargeTotalAmount - AllowanceTotalAmount
  v.check((input) => {
    const expected = toCent(input.lineExtensionAmount) + toCent(input.chargeTotalAmount) - toCent(input.allowanceTotalAmount);
    return toCent(input.taxExclusiveAmount) === expected;
  }, '[FATAL] [VRBL-CALC-5]: Poreska osnovica (taxExclusiveAmount) mora biti jednaka zbiru stavki plus troškovi minus popusti.'),

  // 🎯 VRBL-CALC-6: PayableAmount = TaxInclusiveAmount - PrepaidAmount + RoundingAmount
  v.check((input) => {
    const expected = toCent(input.taxInclusiveAmount) - toCent(input.prepaidAmount || 0); // Assuming RoundingAmount is 0 for now
    return toCent(input.payableAmount) === expected;
  }, '[FATAL] [VRBL-CALC-6]: Iznos za uplatu (payableAmount) mora biti jednak bruto iznosu (taxInclusiveAmount) minus avans (prepaidAmount).'),

  // 🎯 VRBL-CALC-8: LineExtensionAmount = sum(InvoiceLineExtensionAmount)
  v.check((input) => {
    const sumLines = input.invoiceLines.reduce((acc, line) => acc + toCent(line.lineExtensionAmount), 0);
    return toCent(input.lineExtensionAmount) === sumLines;
  }, '[FATAL] [VRBL-CALC-8]: Krovni neto iznos (lineExtensionAmount) mora biti jednak zbiru neto iznosa svih linija fakture.')
);
