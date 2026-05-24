import { XmlTransformer } from '../transformer/XmlTransformer.js';
import type { ReceiptAdvice, ReceiptLine } from '../models/ReceiptAdvice.js';
import type { Party } from '../models/Invoice.js';

/**
 * ReceiptBuilder - UBL 2.1 ReceiptAdvice (ePrijemnica)
 * Koristi se za potvrdu prijema robe i dokumentovanje razlika (discrepancy).
 */
export class ReceiptBuilder {
  private receipt: Partial<ReceiptAdvice> = {
    lines: [],
    note: []
  };

  static create(id: string, issueDate: string): ReceiptBuilder {
    const builder = new ReceiptBuilder();
    builder.receipt.id = id;
    builder.receipt.issueDate = issueDate;
    return builder;
  }

  setSeller(party: Party): this {
    this.receipt.seller = party;
    return this;
  }

  setBuyer(party: Party): this {
    this.receipt.buyer = party;
    return this;
  }

  setDespatchReference(id: string, date?: string): this {
    this.receipt.despatchDocumentReference = { id, issueDate: date };
    return this;
  }

  addLine(line: ReceiptLine): this {
    this.receipt.lines!.push(line);
    return this;
  }

  addNote(note: string): this {
    if (!this.receipt.note) this.receipt.note = [];
    this.receipt.note.push(note);
    return this;
  }

  build(): ReceiptAdvice {
    if (!this.receipt.id || !this.receipt.seller || !this.receipt.buyer || !this.receipt.lines?.length) {
      throw new Error("🛡️ [ReceiptBuilder] FATAL: Nedostaju obavezna polja za prijemnicu (ID, Prodavac, Kupac, Stavke).");
    }
    return this.receipt as ReceiptAdvice;
  }

  toXml(): string {
    const advice = this.build();
    return XmlTransformer.transformReceipt(advice);
  }
}
