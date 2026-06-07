import { safeParse } from 'valibot';
import { SefInvoiceInputSchema, SefInvoiceInput } from './validator.js';

/**
 * normalizeInput — SSOT validation engine for SEF Bridge.
 * Strict English keys only. No fallbacks allowed.
 */
export function normalizeInput(input: any): SefInvoiceInput {
  const result = safeParse(SefInvoiceInputSchema, input);
  
  if (!result.success) {
    const error = new Error('INVALID_UBL_INPUT_STRUCTURE');
    (error as any).issues = result.issues;
    throw error;
  }

  return result.output;
}
