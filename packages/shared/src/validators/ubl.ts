import * as v from 'valibot';

/**
 * Vertex/SEF Compliance Validators
 * Focus: Serbian UBL 2.1 Profile (mfin.gov.rs)
 */

export const TaxCategorySchema = v.picklist(['S', 'AE', 'Z', 'E', 'AE20', 'AE10', 'S20', 'S10']);

export const ForeignCurrencyTaxTotalSchema = v.object({
  TaxAmount: v.number(),
  Currency: v.string(), // e.g., 'EUR'
  // In Serbian SEF, if currency != RSD, we must also provide the RSD equivalent
  RsdTaxAmount: v.number(), 
  DocumentCurrencyCode: v.literal('RSD')
});

export const DespatchReferenceSchema = v.object({
  ID: v.string(),
  IssueDate: v.string(), // ISO Date
  DocumentTypeCode: v.optional(v.string())
});

export const InvoiceSchema = v.object({
  ID: v.string(),
  IssueDate: v.string(),
  InvoiceCurrencyCode: v.string(),
  TaxTotal: v.array(ForeignCurrencyTaxTotalSchema),
  BillingReference: v.optional(v.array(DespatchReferenceSchema)),
  // Add other necessary fields
});

export type InvoiceInput = v.InferOutput<typeof InvoiceSchema>;
