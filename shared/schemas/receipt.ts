import * as v from 'valibot';

const DateRegex = /^\d{4}-\d{2}-\d{2}$/;
const PibRegex = /^\d{9}$/;

/**
 * ReceiptSchema - Valibot schema for ePrijemnica API Input.
 * Flattened for supply chain ease of use.
 */
export const ReceiptSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1, 'ID je obavezan')),
  issueDate: v.pipe(v.string(), v.regex(DateRegex, 'Datum izdavanja mora biti YYYY-MM-DD')),
  
  supplierPib: v.pipe(v.string(), v.regex(PibRegex, 'PIB prodavca mora imati 9 cifara')),
  customerPib: v.pipe(v.string(), v.regex(PibRegex, 'PIB kupca mora imati 9 cifara')),
  
  despatchReference: v.optional(v.object({
    id: v.string(),
    issueDate: v.optional(v.pipe(v.string(), v.regex(DateRegex))),
  })),

  lines: v.pipe(
    v.array(v.object({
      id: v.string(),
      receivedQuantity: v.pipe(v.number(), v.minValue(0)),
      unitCode: v.string(),
      shortQuantity: v.optional(v.number()),
      rejectedQuantity: v.optional(v.number()),
      rejectReason: v.optional(v.string()),
      itemName: v.pipe(v.string(), v.minLength(1)),
      itemIdentification: v.optional(v.string()),
      despatchLineId: v.optional(v.string()),
    })),
    v.minLength(1, 'Prijemnica mora imati bar jednu stavku')
  ),
  note: v.optional(v.array(v.string()))
});

export type ReceiptInput = v.InferOutput<typeof ReceiptSchema>;
