/**
 * SefXmlBuilder - TypeScript types and builder for Serbian SEF (Sistem Elektronskih Faktura).
 * Based on UBL 2.1 with Serbian extensions (mfin.gov.rs).
 */

import * as v from 'valibot';

export type SefInvoiceType = '380' | '386' | '381' | '383';
export type SefVatCategory = 'S' | 'E' | 'AE' | 'Z' | 'OE' | 'R' | 'G' | 'O';
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
    VatCategory: v.picklist(['S', 'E', 'AE', 'Z', 'OE', 'R', 'G', 'O']),
    VatPercent: v.number(),
    AllowanceCharge: v.optional(v.object({
      ChargeIndicator: v.boolean(),
      Amount: v.number(),
      Reason: v.optional(v.string()),
    })),
    ItemIdentification: v.optional(v.string()),
  })),
});

export const SefWebhookSchema = v.object({
  kompanija_pib: v.pipe(v.string(), v.regex(PibRegex, 'PIB mora imati tačno 9 cifara')),
  faktura_id: v.pipe(v.string(), v.minLength(1, 'Faktura ID je obavezan')),
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

export class SefXmlBuilder {
  private static escapeXml(unsafe: string | undefined): string {
    if (unsafe === undefined || unsafe === null) return '';
    return unsafe.replace(/[<>&"']/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '"': return '&quot;';
        case "'": return '&apos;';
        default: return c;
      }
    });
  }

  private static formatAmount(amount: number): string {
    return amount.toFixed(2);
  }

  public static build(data: SefInvoiceData): string {
    const isCreditNote = data.InvoiceTypeCode === '381';
    const rootTag = isCreditNote ? 'CreditNote' : 'Invoice';
    const nsPrefix = isCreditNote ? 'CreditNote-2' : 'Invoice-2';
    
    const xml: string[] = [];
    xml.push('<?xml version="1.0" encoding="utf-8"?>');
    xml.push(`<${rootTag} xmlns:cec="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" ` +
             'xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" ' +
             'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" ' +
             'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
             'xmlns:xsd="http://www.w3.org/2001/XMLSchema" ' +
             'xmlns:sbt="http://mfin.gov.rs/srbdt/srbdtext" ' +
             `xmlns="urn:oasis:names:specification:ubl:schema:xsd:${nsPrefix}">`);

    // UBL Extensions
    if (data.SrbDtExt) {
      xml.push('  <cec:UBLExtensions>');
      xml.push('    <cec:UBLExtension>');
      xml.push('      <cec:ExtensionContent>');
      xml.push('        <sbt:SrbDtExt>');
      
      if (data.SrbDtExt.InvoicedPrepaymentAmount) {
        for (const prepay of data.SrbDtExt.InvoicedPrepaymentAmount) {
          xml.push('          <sbt:InvoicedPrepaymentAmount>');
          xml.push(`            <cbc:ID>${this.escapeXml(prepay.ID)}</cbc:ID>`);
          xml.push(this.buildTaxTotal(prepay.TaxTotal, data.DocumentCurrencyCode, '            '));
          xml.push('          </sbt:InvoicedPrepaymentAmount>');
        }
      }

      if (data.SrbDtExt.ReducedTotals) {
        xml.push('          <sbt:ReducedTotals>');
        xml.push(this.buildTaxTotal(data.SrbDtExt.ReducedTotals.TaxTotal, data.DocumentCurrencyCode, '            '));
        xml.push('            <cac:LegalMonetaryTotal>');
        xml.push(`              <cbc:TaxExclusiveAmount currencyID="${data.DocumentCurrencyCode}">${this.formatAmount(data.SrbDtExt.ReducedTotals.LegalMonetaryTotal.TaxExclusiveAmount)}</cbc:TaxExclusiveAmount>`);
        xml.push(`              <cbc:TaxInclusiveAmount currencyID="${data.DocumentCurrencyCode}">${this.formatAmount(data.SrbDtExt.ReducedTotals.LegalMonetaryTotal.TaxInclusiveAmount)}</cbc:TaxInclusiveAmount>`);
        xml.push(`              <cbc:PayableAmount currencyID="${data.DocumentCurrencyCode}">${this.formatAmount(data.SrbDtExt.ReducedTotals.LegalMonetaryTotal.PayableAmount)}</cbc:PayableAmount>`);
        xml.push('            </cac:LegalMonetaryTotal>');
        xml.push('          </sbt:ReducedTotals>');
      }

      xml.push('        </sbt:SrbDtExt>');
      xml.push('      </cec:ExtensionContent>');
      xml.push('    </cec:UBLExtension>');
      xml.push('  </cec:UBLExtensions>');
    }

    xml.push(`  <cbc:CustomizationID>${data.CustomizationID || 'urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.rs:srbdt:2022'}</cbc:CustomizationID>`);
    if (data.ProfileID) {
      xml.push(`  <cbc:ProfileID>${data.ProfileID}</cbc:ProfileID>`);
    }
    xml.push(`  <cbc:ID>${this.escapeXml(data.ID)}</cbc:ID>`);
    xml.push(`  <cbc:IssueDate>${data.IssueDate}</cbc:IssueDate>`);
    
    if (isCreditNote) {
      xml.push(`  <cbc:CreditNoteTypeCode>${data.InvoiceTypeCode}</cbc:CreditNoteTypeCode>`);
    } else {
      xml.push(`  <cbc:DueDate>${data.DueDate}</cbc:DueDate>`);
      xml.push(`  <cbc:InvoiceTypeCode>${data.InvoiceTypeCode}</cbc:InvoiceTypeCode>`);
    }
    
    if (data.Note) {
      xml.push(`  <cbc:Note>${this.escapeXml(data.Note)}</cbc:Note>`);
    }
    
    xml.push(`  <cbc:DocumentCurrencyCode>${data.DocumentCurrencyCode}</cbc:DocumentCurrencyCode>`);
    
    if (data.BuyerReference) {
      xml.push(`  <cbc:BuyerReference>${this.escapeXml(data.BuyerReference)}</cbc:BuyerReference>`);
    }

    if (data.InvoicePeriod) {
      xml.push('  <cac:InvoicePeriod>');
      if (data.InvoicePeriod.StartDate) xml.push(`    <cbc:StartDate>${data.InvoicePeriod.StartDate}</cbc:StartDate>`);
      if (data.InvoicePeriod.EndDate) xml.push(`    <cbc:EndDate>${data.InvoicePeriod.EndDate}</cbc:EndDate>`);
      if (data.InvoicePeriod.DescriptionCode) xml.push(`    <cbc:DescriptionCode>${data.InvoicePeriod.DescriptionCode}</cbc:DescriptionCode>`);
      xml.push('  </cac:InvoicePeriod>');
    }

    if (data.BillingReference) {
      xml.push('  <cac:BillingReference>');
      xml.push('    <cac:InvoiceDocumentReference>');
      xml.push(`      <cbc:ID>${this.escapeXml(data.BillingReference.ID)}</cbc:ID>`);
      if (data.BillingReference.IssueDate) {
        xml.push(`      <cbc:IssueDate>${data.BillingReference.IssueDate}</cbc:IssueDate>`);
      }
      xml.push('    </cac:InvoiceDocumentReference>');
      xml.push('  </cac:BillingReference>');
    }

    if (data.OrderReference) {
      xml.push('  <cac:OrderReference>');
      xml.push(`    <cbc:ID>${this.escapeXml(data.OrderReference.ID)}</cbc:ID>`);
      xml.push('  </cac:OrderReference>');
    }

    if (data.DespatchDocumentReference) {
      xml.push('  <cac:DespatchDocumentReference>');
      xml.push(`    <cbc:ID>${this.escapeXml(data.DespatchDocumentReference.ID)}</cbc:ID>`);
      xml.push('  </cac:DespatchDocumentReference>');
    }

    if (data.OriginatorDocumentReference) {
      xml.push('  <cac:OriginatorDocumentReference>');
      xml.push(`    <cbc:ID>${this.escapeXml(data.OriginatorDocumentReference.ID)}</cbc:ID>`);
      xml.push('  </cac:OriginatorDocumentReference>');
    }

    if (data.ContractDocumentReference) {
      xml.push('  <cac:ContractDocumentReference>');
      xml.push(`    <cbc:ID>${this.escapeXml(data.ContractDocumentReference.ID)}</cbc:ID>`);
      xml.push('  </cac:ContractDocumentReference>');
    }

    if (data.AdditionalDocumentReference) {
      for (const doc of data.AdditionalDocumentReference) {
        xml.push('  <cac:AdditionalDocumentReference>');
        xml.push(`    <cbc:ID>${this.escapeXml(doc.ID)}</cbc:ID>`);
        xml.push(`    <cbc:DocumentTypeCode>${doc.DocumentTypeCode}</cbc:DocumentTypeCode>`);
        xml.push('  </cac:AdditionalDocumentReference>');
      }
    }

    // Supplier
    xml.push(this.buildParty('cac:AccountingSupplierParty', data.Supplier));
    
    // Customer
    xml.push(this.buildParty('cac:AccountingCustomerParty', data.Customer));

    if (data.Delivery) {
      xml.push('  <cac:Delivery>');
      xml.push(`    <cbc:ActualDeliveryDate>${data.Delivery.ActualDeliveryDate}</cbc:ActualDeliveryDate>`);
      xml.push('  </cac:Delivery>');
    }

    if (data.PaymentMeans) {
      xml.push('  <cac:PaymentMeans>');
      xml.push(`    <cbc:PaymentMeansCode>${data.PaymentMeans.PaymentMeansCode}</cbc:PaymentMeansCode>`);
      if (data.PaymentMeans.PaymentID) {
        xml.push(`    <cbc:PaymentID>${this.escapeXml(data.PaymentMeans.PaymentID)}</cbc:PaymentID>`);
      }
      if (data.PaymentMeans.PayeeFinancialAccount) {
        xml.push('    <cac:PayeeFinancialAccount>');
        xml.push(`      <cbc:ID>${this.escapeXml(data.PaymentMeans.PayeeFinancialAccount.ID)}</cbc:ID>`);
        xml.push('    </cac:PayeeFinancialAccount>');
      }
      xml.push('  </cac:PaymentMeans>');
    }

    const taxTotals = data.TaxTotals || [];
    for (const taxTotal of taxTotals) {
      xml.push(this.buildTaxTotal(taxTotal, data.DocumentCurrencyCode, '  '));
    }

    const lmt = data.LegalMonetaryTotal;
    if (lmt) {
      xml.push('  <cac:LegalMonetaryTotal>');
      xml.push(`    <cbc:LineExtensionAmount currencyID="${data.DocumentCurrencyCode}">${this.formatAmount(lmt.LineExtensionAmount || 0)}</cbc:LineExtensionAmount>`);
      xml.push(`    <cbc:TaxExclusiveAmount currencyID="${data.DocumentCurrencyCode}">${this.formatAmount(lmt.TaxExclusiveAmount || 0)}</cbc:TaxExclusiveAmount>`);
      xml.push(`    <cbc:TaxInclusiveAmount currencyID="${data.DocumentCurrencyCode}">${this.formatAmount(lmt.TaxInclusiveAmount || 0)}</cbc:TaxInclusiveAmount>`);
      xml.push(`    <cbc:AllowanceTotalAmount currencyID="${data.DocumentCurrencyCode}">${this.formatAmount(lmt.AllowanceTotalAmount || 0)}</cbc:AllowanceTotalAmount>`);
      xml.push(`    <cbc:PrepaidAmount currencyID="${data.DocumentCurrencyCode}">${this.formatAmount(lmt.PrepaidAmount || 0)}</cbc:PrepaidAmount>`);
      xml.push(`    <cbc:PayableRoundingAmount currencyID="${data.DocumentCurrencyCode}">${this.formatAmount(lmt.PayableRoundingAmount || 0)}</cbc:PayableRoundingAmount>`);
      xml.push(`    <cbc:PayableAmount currencyID="${data.DocumentCurrencyCode}">${this.formatAmount(lmt.PayableAmount || 0)}</cbc:PayableAmount>`);
      xml.push('  </cac:LegalMonetaryTotal>');
    }

    const lines = data.Lines || [];
    for (const line of lines) {
      const lineTag = isCreditNote ? 'cac:CreditNoteLine' : 'cac:InvoiceLine';
      const qtyTag = isCreditNote ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity';
      
      xml.push(`  <${lineTag}>`);
      xml.push(`    <cbc:ID>${this.escapeXml(line.ID)}</cbc:ID>`);
      xml.push(`    <${qtyTag} unitCode="${line.UnitCode}">${line.Quantity}</${qtyTag}>`);
      xml.push(`    <cbc:LineExtensionAmount currencyID="${data.DocumentCurrencyCode}">${this.formatAmount(line.LineExtensionAmount)}</cbc:LineExtensionAmount>`);
      
      if (line.AllowanceCharge) {
        xml.push('    <cac:AllowanceCharge>');
        xml.push(`      <cbc:ChargeIndicator>${line.AllowanceCharge.ChargeIndicator}</cbc:ChargeIndicator>`);
        xml.push(`      <cbc:Amount currencyID="${data.DocumentCurrencyCode}">${this.formatAmount(line.AllowanceCharge.Amount)}</cbc:Amount>`);
        if (line.AllowanceCharge.Reason) {
          xml.push(`      <cbc:AllowanceChargeReason>${this.escapeXml(line.AllowanceCharge.Reason)}</cbc:AllowanceChargeReason>`);
        }
        xml.push('    </cac:AllowanceCharge>');
      }

      xml.push('    <cac:Item>');
      xml.push(`      <cbc:Name>${this.escapeXml(line.ItemName)}</cbc:Name>`);
      if (line.ItemIdentification) {
        xml.push('      <cac:SellersItemIdentification>');
        xml.push(`        <cbc:ID>${this.escapeXml(line.ItemIdentification)}</cbc:ID>`);
        xml.push('      </cac:SellersItemIdentification>');
      }
      xml.push('      <cac:ClassifiedTaxCategory>');
      xml.push(`        <cbc:ID>${line.VatCategory}</cbc:ID>`);
      xml.push(`        <cbc:Percent>${line.VatPercent}</cbc:Percent>`);
      xml.push('        <cac:TaxScheme>');
      xml.push('          <cbc:ID>VAT</cbc:ID>');
      xml.push('        </cac:TaxScheme>');
      xml.push('      </cac:ClassifiedTaxCategory>');
      xml.push('    </cac:Item>');
      xml.push('    <cac:Price>');
      xml.push(`      <cbc:PriceAmount currencyID="${data.DocumentCurrencyCode}">${this.formatAmount(line.Price)}</cbc:PriceAmount>`);
      xml.push('    </cac:Price>');
      xml.push(`  </${lineTag}>`);
    }

    xml.push(`</${rootTag}>`);
    return xml.join('\n');
  }

  private static buildTaxTotal(taxTotal: SefTaxTotal | undefined, currency: string, indent: string): string {
    if (!taxTotal) return '';
    const xml: string[] = [];
    xml.push(`${indent}<cac:TaxTotal>`);
    xml.push(`${indent}  <cbc:TaxAmount currencyID="${currency}">${this.formatAmount(taxTotal.TaxAmount)}</cbc:TaxAmount>`);
    for (const subtotal of taxTotal.Subtotals) {
      xml.push(`${indent}  <cac:TaxSubtotal>`);
      xml.push(`${indent}    <cbc:TaxableAmount currencyID="${currency}">${this.formatAmount(subtotal.TaxableAmount)}</cbc:TaxableAmount>`);
      xml.push(`${indent}    <cbc:TaxAmount currencyID="${currency}">${this.formatAmount(subtotal.TaxAmount)}</cbc:TaxAmount>`);
      xml.push(`${indent}    <cac:TaxCategory>`);
      xml.push(`${indent}      <cbc:ID>${subtotal.Category}</cbc:ID>`);
      xml.push(`${indent}      <cbc:Percent>${subtotal.Percent}</cbc:Percent>`);
      if (subtotal.ExemptionReasonCode) {
        xml.push(`${indent}      <cbc:TaxExemptionReasonCode>${this.escapeXml(subtotal.ExemptionReasonCode)}</cbc:TaxExemptionReasonCode>`);
      }
      if (subtotal.ExemptionReason) {
        xml.push(`${indent}      <cbc:TaxExemptionReason>${this.escapeXml(subtotal.ExemptionReason)}</cbc:TaxExemptionReason>`);
      }
      xml.push(`${indent}      <cac:TaxScheme>`);
      xml.push(`${indent}        <cbc:ID>VAT</cbc:ID>`);
      xml.push(`${indent}      </cac:TaxScheme>`);
      xml.push(`${indent}    </cac:TaxCategory>`);
      xml.push(`${indent}  </cac:TaxSubtotal>`);
    }
    xml.push(`${indent}</cac:TaxTotal>`);
    return xml.join('\n');
  }

  private static buildParty(tagName: string, party: SefParty | undefined): string {
    if (!party) return '';
    const xml: string[] = [];
    xml.push(`  <${tagName}>`);
    xml.push('    <cac:Party>');
    xml.push(`      <cbc:EndpointID schemeID="9948">${party.Pib || ''}</cbc:EndpointID>`);
    
    if (party.Jbkjs) {
      xml.push('      <cac:PartyIdentification>');
      xml.push(`        <cbc:ID>JBKJS:${party.Jbkjs}</cbc:ID>`);
      xml.push('      </cac:PartyIdentification>');
    }

    xml.push('      <cac:PartyName>');
    xml.push(`        <cbc:Name>${this.escapeXml(party.Name || '')}</cbc:Name>`);
    xml.push('      </cac:PartyName>');
    
    if (party.Address) {
      xml.push('      <cac:PostalAddress>');
      if (party.Address.Street) xml.push(`        <cbc:StreetName>${this.escapeXml(party.Address.Street)}</cbc:StreetName>`);
      xml.push(`        <cbc:CityName>${this.escapeXml(party.Address.City || '')}</cbc:CityName>`);
      if (party.Address.Zip) xml.push(`        <cbc:PostalZone>${this.escapeXml(party.Address.Zip)}</cbc:PostalZone>`);
      xml.push('        <cac:Country>');
      xml.push(`          <cbc:IdentificationCode>${party.Address.CountryCode || 'RS'}</cbc:IdentificationCode>`);
      xml.push('        </cac:Country>');
      xml.push('      </cac:PostalAddress>');
    }

    xml.push('      <cac:PartyTaxScheme>');
    xml.push(`        <cbc:CompanyID>RS${party.Pib || ''}</cbc:CompanyID>`);
    xml.push('        <cac:TaxScheme>');
    xml.push('          <cbc:ID>VAT</cbc:ID>');
    xml.push('        </cac:TaxScheme>');
    xml.push('      </cac:PartyTaxScheme>');

    xml.push('      <cac:PartyLegalEntity>');
    xml.push(`        <cbc:RegistrationName>${this.escapeXml(party.Name || '')}</cbc:RegistrationName>`);
    if (party.Mb) xml.push(`        <cbc:CompanyID>${party.Mb}</cbc:CompanyID>`);
    xml.push('      </cac:PartyLegalEntity>');

    if (party.Email) {
      xml.push('      <cac:Contact>');
      xml.push(`        <cbc:ElectronicMail>${this.escapeXml(party.Email)}</cbc:ElectronicMail>`);
      xml.push('      </cac:Contact>');
    }

    xml.push('    </cac:Party>');
    xml.push(`  </${tagName}>`);
    return xml.join('\n');
  }
}
