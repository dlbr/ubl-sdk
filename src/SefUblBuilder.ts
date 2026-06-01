import { SefPoreskiJsonBuilder } from './services/PoreskiJsonBuilder.js';
import { MasterValidator, SefInvoiceInput } from './validator.js';
import type { Invoice, SefPoreskaKategorija } from './models/Invoice.js';
import { XmlTransformer } from './transformer/XmlTransformer.js';

export interface CreditNoteInput {
  broj: string;
  pibProdavca: string;
  pibKupca: string;
  originalnaFakturaBroj: string;
  iznosSmanjenja: number;
}

/**
 * SefUblBuilder — v6.0.0
 * Generates SEF-compliant XML from strictly validated English data.
 */
export class SefUblBuilder {
  static build(data: any): string {
    if (data && (data.TipZapisa === 'EEO' || data.TipZapisa === 'EPP')) {
      if (data.TipZapisa === 'EEO') {
        return JSON.stringify(SefPoreskiJsonBuilder.buildZbirniEeoPayload(data));
      } else {
        return JSON.stringify(SefPoreskiJsonBuilder.buildEppPayload(data));
      }
    }

    const v: SefInvoiceInput = MasterValidator.validate(data);
    
    const invoice: Invoice = {
      id: v.invoiceNumber,
      issueDate: v.issueDate,
      dueDate: v.dueDate || v.issueDate,
      deliveryDate: v.deliveryDate,
      typeCode: (v.invoiceTypeCode as any) || '380',
      currency: v.currency || 'RSD',
      exchangeRate: v.exchangeRate || 1.0,
      documentDirection: v.documentDirection,
      invoicePeriod: v.invoicePeriod,
      prepaymentReference: v.prepaymentReference ? {
        id: v.prepaymentReference.id,
        taxAmount: v.prepaymentReference.prepaidAmount - (v.prepaymentReference.prepaidAmount / 1.2)
      } : undefined,
      
      seller: {
        pib: v.supplierPib,
        name: v.supplierName || 'PRODAVAC',
        address: v.supplierAddress || 'Ulica',
        city: v.supplierCity || 'Grad',
        zip: v.supplierZip || '11000',
        maticniBroj: v.supplierMaticniBroj || '00000000',
        jbkjs: v.supplierJbkjs,
        bankAccount: v.supplierBankAccount || '840-0000000000000-00'
      },
      buyer: {
        pib: v.customerPib,
        name: v.customerName || 'KUPAC',
        address: v.customerAddress || 'Ulica',
        city: v.customerCity || 'Grad',
        zip: v.customerZip || '11000',
        maticniBroj: v.customerMaticniBroj || '00000000',
        jbkjs: v.customerJbkjs
      },
      
      lines: v.lines.map((l: any) => ({
        id: l.id,
        description: l.name,
        quantity: l.quantity,
        unitCode: l.unitCode,
        unitPrice: l.priceAmount,
        taxRate: l.taxCategoryPercent || 20,
        taxCategory: (l.taxCategoryCode || 'S') as SefPoreskaKategorija,
        taxExemptionReason: l.taxExemptionReason,
        taxExemptionReasonCode: l.taxExemptionReasonCode
      })),
      
      notes: [
        ...(v.notes ?? []),
        ...(v.pfrNumbers ?? []).map((pfr: string) => `Референтни број обрасца: ${pfr}`)
      ].filter(Boolean),
      billingReference: v.billingReference ? {
        id: v.billingReference.id,
        date: v.billingReference.issueDate,
        typeCode: v.billingReference.typeCode
      } : undefined
    };

    if (v.buyerReference) (invoice as any).buyerReference = v.buyerReference;
    if (v.orderReference) (invoice as any).orderReference = v.orderReference;

    // Calculate TaxTotals dynamically if missing
    let taxAmount = 0;
    const subtotals: Record<string, any> = {};
    for (const l of invoice.lines) {
      const ext = l.quantity * l.unitPrice;
      const t = ext * (l.taxRate / 100);
      taxAmount += t;
      
      const cat = l.taxCategory;
      if (!subtotals[cat]) subtotals[cat] = { taxableAmount: 0, taxAmount: 0, taxCategoryCode: cat, taxCategoryPercent: l.taxRate, taxExemptionReason: l.taxExemptionReason };
      subtotals[cat].taxableAmount += ext;
      subtotals[cat].taxAmount += t;
    }

    (invoice as any).taxTotals = [{
      taxAmount: v.taxAmount,
      taxSchemeId: 'VAT',
      subtotals: Object.values(subtotals)
    }];

    (invoice as any).taxExclusiveAmount = v.taxableAmount;
    (invoice as any).taxInclusiveAmount = v.taxableAmount + v.taxAmount;
    (invoice as any).payableAmount = v.payableAmount;
    (invoice as any).allowanceTotalAmount = v.allowanceTotalAmount;
    (invoice as any).chargeTotalAmount = v.chargeTotalAmount;

    return XmlTransformer.toUblXml(invoice);
  }

  static buildStandardna(data: Partial<SefInvoiceInput>) { return this.build({ ...data, invoiceTypeCode: '380' }); }
  static buildAvansni(data: Partial<SefInvoiceInput>) { return this.build({ ...data, invoiceTypeCode: '386' }); }
  static buildPovecanje(data: Partial<SefInvoiceInput>) { return this.build({ ...data, invoiceTypeCode: '383' }); }
  static buildSmanjenje(data: Partial<SefInvoiceInput>) { return this.build({ ...data, invoiceTypeCode: '381' }); }
  static buildKonacniSaAvansom(data: Partial<SefInvoiceInput>) { return this.build({ ...data, invoiceTypeCode: '380' }); }
  static buildSmanjenjeAvansa(data: Partial<SefInvoiceInput>) { return this.build({ ...data, invoiceTypeCode: '381' }); }
  static buildSmanjenjeUPeriodu(data: Partial<SefInvoiceInput>) { return this.build({ ...data, invoiceTypeCode: '381' }); }
  static buildOslobodjena(data: Partial<SefInvoiceInput>) { return this.build({ ...data, invoiceTypeCode: '380' }); }
  static buildFiskalizacijaProdaja(data: Partial<SefInvoiceInput>) { return this.build({ ...data, invoiceTypeCode: '380' }); }
}
