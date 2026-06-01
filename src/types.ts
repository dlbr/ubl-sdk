import { SefPoreskaKategorija } from './models/Invoice.js';
import { SefInvoiceInput } from './validator.js';

/**
 * PartyInput — Shared between Supplier and Customer
 */
export interface PartyInput {
  pib: string;
  name: string;
  address?: string;
  city?: string;
  zip?: string;
  maticniBroj?: string;
  jbkjs?: string;
  bankAccount?: string;
}

/**
 * ItemLineInput — Shared between Invoice, Despatch, and Receipt
 */
export interface ItemLineInput {
  id: string;
  name: string;
  quantity: number;
  unitCode?: string;
  priceAmount: number;
  lineExtensionAmount: number;
  taxCategoryCode?: string;
  taxCategoryPercent?: number;
  taxExemptionReason?: string;
  taxExemptionReasonCode?: string;
  // Logistics specific
  deliveredQuantity?: number;
  exciseCategory?: string;
}

export type { SefInvoiceInput } from './validator.js';

export interface ValidationOptions {
  mode?: 'B2B' | 'B2G';
  strict?: boolean;
}
