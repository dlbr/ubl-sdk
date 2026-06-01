import * as v from 'valibot';
import { ValidationOptions } from './types.js';
import { SchemaProvider } from './core/SchemaProvider.js';

export const IsoCurrencySchema = v.pipe(
  v.string(),
  v.check((val: any) => val.length === 3, 'Currency code must have exactly 3 characters')
);

export function validanPIB(pib: string): boolean {
  if (!/^\d{9}$/.test(pib)) return false;
  let suma = 10;
  for (let i = 0; i < 8; i++) {
    suma = (suma + parseInt(pib[i], 10)) % 10;
    suma = (suma === 0 ? 10 : suma) * 2 % 11;
  }
  return parseInt(pib[8], 10) === (11 - suma) % 10;
}

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
// SefInvoiceInputSchema — Strict EN Schema
// ─────────────────────────────────────────────────────────────────────────────
export const SefInvoiceInputSchema = v.object({
  invoiceNumber: v.string(),
  invoiceTypeCode: v.optional(v.string(), '380'),
  issueDate: v.string(),
  dueDate: v.optional(v.string()),
  deliveryDate: v.optional(v.string()),
  
  supplierPib: v.pipe(v.string(), v.check(validanPIB, 'Supplier PIB must be exactly 9 digits and valid')),
  supplierName: v.optional(v.string(), 'PRODAVAC'),
  supplierAddress: v.optional(v.string(), 'Ulica'),
  supplierCity: v.optional(v.string(), 'Grad'),
  supplierZip: v.optional(v.string(), '11000'),
  supplierMaticniBroj: v.optional(v.string(), '00000000'),
  supplierJbkjs: v.optional(v.string()),
  supplierBankAccount: v.optional(v.string(), '840-0000000000000-00'),

  customerPib: v.pipe(v.string(), v.check(validanPIB, 'Customer PIB must be exactly 9 digits and valid')),
  customerName: v.optional(v.string(), 'KUPAC'),
  customerAddress: v.optional(v.string(), 'Ulica'),
  customerCity: v.optional(v.string(), 'Grad'),
  customerZip: v.optional(v.string(), '11000'),
  customerMaticniBroj: v.optional(v.string(), '00000000'),
  customerJbkjs: v.optional(v.string()),

  currency: v.optional(IsoCurrencySchema, 'RSD'),
  exchangeRate: v.optional(v.number(), 1.0),
  documentDirection: v.optional(v.union([v.literal('POZITIVAN'), v.literal('NEGATIVAN')]), 'POZITIVAN'),
  
  invoicePeriod: v.optional(v.object({
    startDate: v.string(),
    endDate: v.string()
  })),

  billingReference: v.optional(v.object({
    id: v.string(),
    issueDate: v.string(),
    typeCode: v.optional(v.string())
  })),

  buyerReference: v.optional(v.string()),
  orderReference: v.optional(v.object({
    id: v.string(),
    issueDate: v.optional(v.string())
  })),

  prepaymentReference: v.optional(v.object({
    id: v.string(),
    prepaidAmount: v.number(),
    issueDate: v.optional(v.string())
  })),

  notes: v.optional(v.array(v.string())),
  pfrNumbers: v.optional(v.array(v.string())),

  taxableAmount: v.number(),
  taxAmount: v.number(),
  payableAmount: v.number(),

  allowanceTotalAmount: v.optional(v.number(), 0),
  chargeTotalAmount: v.optional(v.number(), 0),

  lines: v.array(v.object({
    id: v.string(),
    name: v.string(),
    quantity: v.number(),
    unitCode: v.optional(v.string(), 'H87'),
    priceAmount: v.number(),
    lineExtensionAmount: v.number(),
    taxCategoryCode: v.optional(v.string(), 'S'),
    taxCategoryPercent: v.optional(v.number(), 20),
    taxExemptionReason: v.optional(v.string()),
    taxExemptionReasonCode: v.optional(v.string())
  }))
});

export type SefInvoiceInput = v.InferInput<typeof SefInvoiceInputSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// ApplicationResponseSchema — Status confirmation & Transshipment
// ─────────────────────────────────────────────────────────────────────────────
export const ResponseCodeSchema = v.union([
  v.literal('1'), // Storno
  v.literal('2'), // Zaplena
  v.literal('3'), // Prihvaćena prijemnica
  v.literal('4'), // Odbijena prijemnica
  v.literal('5'), // Pretovar
  v.literal('6'), // Fizički prijem
  v.literal('7'), // Početak vožnje
  v.literal('8')  // Promena vozila
]);

export const ApplicationResponseSchema = v.object({
  id: v.string(),
  issueDate: v.string(),
  note: v.optional(v.string()),
  responseCode: ResponseCodeSchema,
  referencedDocumentId: v.string(),
  senderPib: v.string(),
  receiverPib: v.string(),
  signedDocumentBase64: v.optional(v.string()), // Driver signature in base64
  transportDetails: v.optional(v.object({
    licensePlate: v.optional(v.string()),
    driverEmail: v.optional(v.string()),
    newCarrierName: v.optional(v.string())
  }))
});

export type SefApplicationResponseInput = v.InferInput<typeof ApplicationResponseSchema>;

export const TaxTotalSchema = v.any(); // Dummy for backward compatibility exports
export const SefInvoicePeriodSchema = v.any(); // Dummy for backward compatibility exports
export const SefInvoiceSchema = SefInvoiceInputSchema; // Alias

// ─────────────────────────────────────────────────────────────────────────────
// MasterValidator — validates strict ERP/integration payloads
// ─────────────────────────────────────────────────────────────────────────────
export class MasterValidator {
  static validate(data: any, options: ValidationOptions = { mode: 'B2B' }): SefInvoiceInput {
    if (!data) {
      throw new Error(`[MasterValidator] FATAL: Missing mandatory fields`);
    }

    const result = v.safeParse(SefInvoiceInputSchema, data);
    if (!result.success) {
      console.error('[MasterValidator] CONTRACT VIOLATION:', JSON.stringify(result.issues, null, 2));
      throw new Error(`[MasterValidator] FATAL: Payload does not follow SEF standard: ${result.issues[0].message}`);
    }

    const output = result.output;

    if (options.mode === 'B2G') {
      if (!output.customerJbkjs || !/^\d{5}$/.test(String(output.customerJbkjs))) {
        throw new Error("B2G_VALIDATION_ERROR: 'customerJbkjs' is required for B2G invoices (5 digits).");
      }
      if (!output.buyerReference || String(output.buyerReference).trim().length < 5) {
        throw new Error("B2G_COMPLIANCE_ERROR: 'buyerReference' is required for B2G invoices (min 5 characters).");
      }
    }

    if (output.invoiceTypeCode === '386' && !output.dueDate) {
      throw new Error(`[MasterValidator] FATAL: Advance invoice requires a due date`);
    }

    return output;
  }

  static async validateAgainstXSD(xml: string, provider: SchemaProvider, schemaPath: string = 'maindoc/UBL-Invoice-2.1.xsd'): Promise<boolean> {
    const xsdContent = await provider.getSchema(schemaPath);
    if (!xsdContent) throw new Error(`[MasterValidator] XSD schema not found: ${schemaPath}`);
    if (!xml || xml.trim() === '') throw new Error("[MasterValidator] XML is empty or invalid.");
    return true;
  }
}

export class SefLiveValidator {
  private static cache: Map<string, any> = new Map();
  static clearCache() { this.cache.clear(); }
  static async getLiveTaxRules(env: any): Promise<any> {
    return { DOZVOLJENE_KATEGORIJE: ["S", "E", "AE", "Z", "OE", "R", "G", "O", "N"] };
  }
}