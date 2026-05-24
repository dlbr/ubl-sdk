/**
 * SefTypes - TypeScript types and schemas for Serbian SEF (Sistem Elektronskih Faktura).
 * Based on UBL 2.1 with Serbian extensions (mfin.gov.rs).
 */

import * as v from 'valibot';

export type SefInvoiceType = '380' | '386' | '381' | '383';
export type SefVatCategory = 'S' | 'E' | 'AE' | 'Z' | 'OE' | 'R' | 'G' | 'O' | 'N' | 'S20' | 'S10' | 'AE20' | 'AE10';
export type SefCurrency = 'RSD' | 'EUR';

const DateRegex = /^\d{4}-\d{2}-\d{2}$/;
const PibRegex = /^\d{9}$/;
const MbRegex = /^\d{8}$/;

export const SefPartySchema = v.object({
  Pib: v.pipe(v.string(), v.regex(PibRegex, 'PIB mora imati tačno 9 cifara')),
  Name: v.pipe(v.string(), v.minLength(1, 'Naziv je obavezan')),
  Address: v.object({
    Street: v.optional(v.string()),
    City: v.pipe(v.string(), v.minLength(1, 'Grad je obavezan')),
    Zip: v.optional(v.string()),
    CountryCode: v.literal('RS'),
  }),
  Mb: v.optional(v.pipe(v.string(), v.regex(MbRegex, 'Matični broj mora imati tačno 8 cifara'))),
  Email: v.optional(v.pipe(v.string(), v.email('Nevalidna email adresa'))),
  Jbkjs: v.optional(v.string()),
});

export const SefInvoiceSchema = v.object({
  ID: v.pipe(v.string(), v.minLength(1, 'ID je obavezan')),
  IssueDate: v.pipe(v.string(), v.regex(DateRegex, 'Datum mora biti u formatu YYYY-MM-DD')),
  DueDate: v.pipe(v.string(), v.regex(DateRegex, 'Datum mora biti u formatu YYYY-MM-DD')),
  ActualDeliveryDate: v.optional(v.pipe(v.string(), v.regex(DateRegex, 'Datum mora biti u formatu YYYY-MM-DD'))),
  InvoiceTypeCode: v.picklist(['380', '381', '383', '386']),
  DocumentCurrencyCode: v.picklist(['RSD', 'EUR']),
  smerDokumenta: v.optional(v.picklist(['POZITIVAN', 'NEGATIVAN'])),
  Note: v.optional(v.string()),
  
  InvoicePeriod: v.optional(v.object({
    StartDate: v.optional(v.pipe(v.string(), v.regex(DateRegex))),
    EndDate: v.optional(v.pipe(v.string(), v.regex(DateRegex))),
    DescriptionCode: v.optional(v.picklist(['3', '35', '432'])),
  })),

  Supplier: SefPartySchema,
  Customer: SefPartySchema,

  LegalMonetaryTotal: v.object({
    LineExtensionAmount: v.number(),
    TaxExclusiveAmount: v.number(),
    TaxInclusiveAmount: v.number(),
    AllowanceTotalAmount: v.number(),
    PrepaidAmount: v.number(),
    PayableRoundingAmount: v.number(),
    PayableAmount: v.number(),
  }),
  
  Lines: v.array(v.object({
    ID: v.string(),
    Quantity: v.number(),
    UnitCode: v.string(),
    LineExtensionAmount: v.number(),
    Price: v.number(),
    ItemName: v.string(),
    VatCategory: v.picklist(['S', 'E', 'AE', 'Z', 'OE', 'R', 'G', 'O', 'N', 'S20', 'S10', 'AE20', 'AE10']),
    VatPercent: v.number(),
    AllowanceCharge: v.optional(v.object({
      ChargeIndicator: v.boolean(),
      Amount: v.number(),
      Reason: v.optional(v.string()),
    })),
    ItemIdentification: v.optional(v.string()),
  })),

  TaxTotals: v.optional(v.array(v.object({
    TaxAmount: v.number(),
    Subtotals: v.array(v.object({
      TaxableAmount: v.number(),
      TaxAmount: v.number(),
      Category: v.picklist(['S', 'E', 'AE', 'Z', 'OE', 'R', 'G', 'O', 'N', 'S20', 'S10', 'AE20', 'AE10']),
      Percent: v.number(),
      ExemptionReasonCode: v.optional(v.string()),
      ExemptionReason: v.optional(v.string()),
    }))
  }))),
});

export const SefDespatchAdviceSchema = v.object({
  ID: v.pipe(v.string(), v.minLength(1, 'ID je obavezan')),
  IssueDate: v.pipe(v.string(), v.regex(DateRegex, 'Datum mora biti u formatu YYYY-MM-DD')),
  IssueTime: v.optional(v.string()),
  Note: v.optional(v.array(v.string())),
  
  OrderReference: v.optional(v.object({
    ID: v.string(),
    IssueDate: v.optional(v.pipe(v.string(), v.regex(DateRegex))),
  })),

  Supplier: SefPartySchema,
  Customer: SefPartySchema,

  DespatchAddress: v.optional(v.object({
    Street: v.optional(v.string()),
    City: v.string(),
    Zip: v.optional(v.string()),
    CountryCode: v.literal('RS'),
  })),

  DeliveryAddress: v.optional(v.object({
    Street: v.optional(v.string()),
    City: v.string(),
    Zip: v.optional(v.string()),
    CountryCode: v.literal('RS'),
  })),

  Lines: v.array(v.object({
    ID: v.string(),
    DeliveredQuantity: v.number(),
    UnitCode: v.string(),
    ItemName: v.string(),
    ItemIdentification: v.optional(v.string()),
  })),
});

export const SefWebhookSchema = v.object({
  kompanija_pib: v.pipe(v.string(), v.regex(PibRegex, 'PIB mora imati tačno 9 cifara')),
  faktura_id: v.pipe(v.string(), v.minLength(1, 'Faktura ID je obavezan')),
  broj_fakture: v.optional(v.string()),
  status: v.string(), // Ovdje možemo dodati picklist ako znamo sve statuse
  timestamp: v.optional(v.string()),
});

export type SefWebhookInput = v.InferOutput<typeof SefWebhookSchema>;

export interface SefInvoiceData extends v.InferOutput<typeof SefInvoiceSchema> {
  CustomizationID?: string;
  ProfileID?: string;
  BuyerReference?: string;
  OrderReference?: { ID: string };
  DespatchDocumentReference?: { ID: string };
  OriginatorDocumentReference?: { ID: string };
  ContractDocumentReference?: { ID: string };
  AdditionalDocumentReference?: Array<{
    ID: string;
    DocumentTypeCode: string;
  }>;
  BillingReference?: {
    ID: string;
    IssueDate?: string;
  };
  SrbDtExt?: {
    InvoicedPrepaymentAmount?: Array<{
      ID: string;
      TaxTotal: SefTaxTotal;
    }>;
    ReducedTotals?: {
      TaxTotal: SefTaxTotal;
      LegalMonetaryTotal: {
        TaxExclusiveAmount: number;
        TaxInclusiveAmount: number;
        PayableAmount: number;
      };
    };
  };
  Delivery?: {
    ActualDeliveryDate: string;
  };
  PaymentMeans?: {
    PaymentMeansCode: string;
    PaymentID?: string;
    PayeeFinancialAccount?: {
      ID: string;
    };
  };
  TaxTotals: SefTaxTotal[];
}

export interface SefParty {
  Pib: string;
  Name: string;
  Address: {
    Street?: string;
    City: string;
    Zip?: string;
    CountryCode: 'RS';
  };
  Mb?: string;
  Email?: string;
  Jbkjs?: string; // For budget users
}

export interface SefTaxTotal {
  TaxAmount: number;
  Subtotals: SefTaxSubtotal[];
}

export interface SefTaxSubtotal {
  TaxableAmount: number;
  TaxAmount: number;
  Category: SefVatCategory;
  Percent: number;
  ExemptionReasonCode?: string;
  ExemptionReason?: string;
}

export interface SefLegalMonetaryTotal {
  LineExtensionAmount: number; // Sum of line net amounts
  TaxExclusiveAmount: number;  // Base for VAT
  TaxInclusiveAmount: number;  // Total with VAT
  AllowanceTotalAmount: number;
  PrepaidAmount: number;
  PayableRoundingAmount: number;
  PayableAmount: number;       // Final amount to pay
}

export interface SefInvoiceLine {
  ID: string;
  Quantity: number;
  UnitCode: string; // e.g., "HUR", "PCE", "KWT"
  LineExtensionAmount: number; // Net amount
  Price: number; // Price per unit
  ItemName: string;
  ItemIdentification?: string;
  VatCategory: SefVatCategory;
  VatPercent: number;
  AllowanceCharge?: {
    ChargeIndicator: boolean; // true = charge, false = allowance (discount)
    Amount: number;
    Reason?: string;
  };
}

// SefXmlBuilder uklonjen u korist @dlbr/sef-ubl-builder paketa
