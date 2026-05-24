import type { Invoice, Party, InvoiceLine, SefPoreskaKategorija } from '../models/Invoice.js';
import { XmlTransformer } from '../transformer/XmlTransformer.js';
import { MasterValidator } from '../validator.js';

/**
 * InvoiceBuilder - Fluentni interfejs za izgradnju SEF-compliant faktura.
 */
export class InvoiceBuilder {
  private invoice: Partial<Invoice> = {
    currency: 'RSD',
    lines: []
  };

  static create(): InvoiceBuilder {
    return new InvoiceBuilder();
  }

  setBasicInfo(id: string, type: '380' | '381' | '383' | '386', issueDate: string, dueDate: string): this {
    this.invoice.id = id;
    this.invoice.typeCode = type;
    this.invoice.issueDate = issueDate;
    this.invoice.dueDate = dueDate;
    return this;
  }

  setSeller(seller: Party): this {
    this.invoice.seller = seller;
    return this;
  }

  setBuyer(buyer: Party): this {
    this.invoice.buyer = buyer;
    return this;
  }

  setDeliveryDate(date: string): this {
    this.invoice.deliveryDate = date;
    return this;
  }

  setNote(note: string): this {
    if (!this.invoice.notes) this.invoice.notes = [];
    this.invoice.notes.push(note);
    return this;
  }

  setBillingReference(id: string, date: string): this {
    this.invoice.billingReference = { id, date };
    return this;
  }

  addLine(line: InvoiceLine): this {
    this.invoice.lines!.push(line);
    return this;
  }

  buildXml(): string {
    const finalInvoice = this.build();
    // Industrial Gate: Validacija pre transformacije
    MasterValidator.validate(finalInvoice);
    return XmlTransformer.toUblXml(finalInvoice);
  }

  build(): Invoice {
    if (!this.invoice.id || !this.invoice.seller || !this.invoice.buyer || !this.invoice.typeCode) {
      throw new Error("🛡️ [InvoiceBuilder] FATAL: Nedostaju obavezna polja (ID, Prodavac, Kupac, Tip).");
    }
    return this.invoice as Invoice;
  }
}
