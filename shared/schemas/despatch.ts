import * as v from 'valibot';

/**
 * Date and PIB RegEx for strict Serbian compliance.
 */
const DateRegex = /^\d{4}-\d{2}-\d{2}$/;
const PibRegex = /^\d{9}$/;

/**
 * DespatchSchema - Valibot schema for eOtpremnica API Input.
 * This schema uses a flattened structure for ERP ease of use.
 */
export const DespatchSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1, 'ID je obavezan')),
  issueDate: v.pipe(v.string(), v.regex(DateRegex, 'Datum izdavanja mora biti YYYY-MM-DD')),
  despatchDate: v.pipe(v.string(), v.regex(DateRegex, 'Datum otpreme mora biti YYYY-MM-DD')),
  supplierPib: v.pipe(v.string(), v.regex(PibRegex, 'PIB prodavca mora imati 9 cifara')),
  customerPib: v.pipe(v.string(), v.regex(PibRegex, 'PIB kupca mora imati 9 cifara')),
  lines: v.pipe(
    v.array(v.object({
      id: v.string(),
      name: v.pipe(v.string(), v.minLength(1)),
      quantity: v.pipe(v.number(), v.minValue(0)),
      unitCode: v.string(),
      exciseCategory: v.optional(v.string()),
      itemProperties: v.optional(v.record(v.string(), v.string()))
    })),
    v.minLength(1, 'Otpremnica mora imati bar jednu stavku')
  ),
  billingReference: v.optional(v.string())
});

export type DespatchInput = v.InferOutput<typeof DespatchSchema>;
