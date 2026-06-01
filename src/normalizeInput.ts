import { safeParse } from 'valibot';
import { SefInvoiceInputSchema, SefInvoiceInput } from './validator.js';

/**
 * normalizeInput — SSOT validation engine for SEF Bridge.
 * Strict English keys only. No fallbacks allowed.
 */
export function normalizeInput(input: any): SefInvoiceInput {
  const result = safeParse(SefInvoiceInputSchema, input);
  
  if (!result.success) {
    console.error('🛡️ [SDK] INVALID_UBL_INPUT_STRUCTURE:', JSON.stringify(result.issues, null, 2));
    throw new Error('INVALID_UBL_INPUT_STRUCTURE');
  }

  return result.output;
}
