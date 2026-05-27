import { SefPoreskiJsonBuilder } from './services/PoreskiJsonBuilder.js';
import { MasterValidator } from './validator.js';
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
 * Generiše SEF-compliant XML iz striktno validiranih podataka.
 */
export class SefUblBuilder {
  /**
   * build — Glavna ulazna tačka za konverziju u XML ili JSON.
   */
  static build(data: any): string {
    // Intercept EEO/EPP tax declarations and return JSON strings
    if (data && (data.TipZapisa === 'EEO' || data.TipZapisa === 'EPP')) {
      if (data.TipZapisa === 'EEO') {
        return JSON.stringify(SefPoreskiJsonBuilder.buildZbirniEeoPayload(data));
      } else {
        return JSON.stringify(SefPoreskiJsonBuilder.buildEppPayload(data));
      }
    }

    const v = MasterValidator.validate(data);
    
    const invoice: Invoice = {
      id: v.id,
      issueDate: v.issueDate,
      dueDate: v.paymentDueDate,
      deliveryDate: v.deliveryDate,
      typeCode: v.invoiceTypeCode,
      currency: v.documentCurrencyCode || 'RSD',
      exchangeRate: parseFloat(v.kurs ?? v.exchangeRate ?? data.PaymentExchangeRate ?? data.exchangeRate ?? 0),
      documentDirection: v.smerDokumenta,
      invoicePeriod: v.invoicePeriod,
      prepaymentReference: v.prepaymentReference,
      
      seller: {
        pib: v.pibS,
        name: v.seller?.name ?? 'PRODAVAC',
        address: v.seller?.address ?? 'Ulica',
        city: v.seller?.city ?? 'Grad',
        zip: v.seller?.zip ?? '11000',
        maticniBroj: v.seller?.maticniBroj ?? '00000000',
        jbkjs: v.seller?.jbkjs,
        bankAccount: v.seller?.bankAccount ?? '840-0000000000000-00'
      },
      buyer: {
        pib: v.pibB,
        name: v.buyer?.name ?? 'KUPAC',
        address: v.buyer?.address ?? 'Ulica',
        city: v.buyer?.city ?? 'Grad',
        zip: v.buyer?.zip ?? '11000',
        maticniBroj: v.buyer?.maticniBroj ?? '00000000',
        jbkjs: v.buyer?.jbkjs
      },
      
      lines: v.invoiceLines.map((l: any) => ({
        id: l.id,
        description: l.name,
        quantity: l.invoicedQuantity,
        unitCode: l.unitCode,
        unitPrice: l.priceAmount,
        taxRate: l.taxCategoryPercent ?? 20,
        taxCategory: (l.taxCategoryCode || 'S') as SefPoreskaKategorija,
        taxExemptionReason: l.taxExemptionReason
      })),
      
      notes: [
        ...(v.notes ?? []),
        ...(v.pfrBrojevi ?? []).map((pfr: string) => `Референтни број обрасца: ${pfr}`)
      ].filter(Boolean),
      billingReference: v.billingReference
    };

    return XmlTransformer.toUblXml(invoice);
  }

  static buildStandardna(data: any) { return this.build({ ...data, invoiceTypeCode: '380' }); }
  static buildAvansni(data: any) { return this.build({ ...data, invoiceTypeCode: '386' }); }
  static buildSmanjenje(data: any) { return this.build({ ...data, invoiceTypeCode: '381' }); }
  static buildPovecanje(data: any) { return this.build({ ...data, invoiceTypeCode: '383' }); }
  static buildKonacniSaAvansom(data: any) { return this.build({ ...data, invoiceTypeCode: '380' }); }
  static buildSmanjenjeAvansa(data: any) { return this.build({ ...data, invoiceTypeCode: '381' }); }
  static buildSmanjenjeUPeriodu(data: any) { return this.build({ ...data, invoiceTypeCode: '381' }); }
  static buildOslobodjena(data: any) { return this.build({ ...data, invoiceTypeCode: '380' }); }
  static buildFiskalizacijaProdaja(data: any) { return this.build({ ...data, invoiceTypeCode: '380' }); }
}
