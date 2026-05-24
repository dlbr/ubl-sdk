import { XmlTransformer } from '../transformer/XmlTransformer.js';
import { MasterValidator } from '../validator.js';
import type { DespatchAdvice, DespatchLine } from '../models/DespatchAdvice.js';
import type { Party } from '../models/Invoice.js';

/**
 * DespatchBuilder - UBL 2.1 DespatchAdvice (eOtpremnica)
 * Specijalizovan za logistički promet i SUPPLY CHAIN STATE.
 */
export class DespatchBuilder {
  private despatch: Partial<DespatchAdvice> = {
    lines: [],
    note: []
  };

  static create(id: string, issueDate: string): DespatchBuilder {
    const builder = new DespatchBuilder();
    builder.despatch.id = id;
    builder.despatch.issueDate = issueDate;
    return builder;
  }

  setSeller(party: Party): this {
    this.despatch.seller = party;
    return this;
  }

  setBuyer(party: Party): this {
    this.despatch.buyer = party;
    return this;
  }

  setOrderReference(id: string, date?: string): this {
    this.despatch.orderReference = { id, issueDate: date };
    return this;
  }

  setDespatchAddress(addr: DespatchAdvice['despatchAddress']): this {
    this.despatch.despatchAddress = addr;
    return this;
  }

  setDeliveryAddress(addr: DespatchAdvice['deliveryAddress']): this {
    this.despatch.deliveryAddress = addr;
    return this;
  }

  setShipmentMethod(method: DespatchAdvice['shipmentMethod']): this {
    this.despatch.shipmentMethod = method;
    return this;
  }

  setThirdPartyGoodsId(id: string): this {
    this.despatch.thirdPartyGoodsId = id;
    return this;
  }

  setIsReturn(isReturn: boolean): this {
    this.despatch.isReturn = isReturn;
    return this;
  }

  setOfflineZinNumber(zin: string): this {
    this.despatch.offlineZinNumber = zin;
    return this;
  }

  addLine(line: DespatchLine): this {
    this.despatch.lines!.push(line);
    return this;
  }

  addNote(note: string): this {
    if (!this.despatch.note) this.despatch.note = [];
    this.despatch.note.push(note);
    return this;
  }

  build(): DespatchAdvice {
    if (!this.despatch.id || !this.despatch.seller || !this.despatch.buyer || !this.despatch.lines?.length) {
      throw new Error("🛡️ [DespatchBuilder] FATAL: Nedostaju obavezna polja za otpremnicu (ID, Prodavac, Kupac, Stavke).");
    }
    return this.despatch as DespatchAdvice;
  }

  toXml(): string {
    const advice = this.build();
    // Ovde ćemo pozvati XmlTransformer koji ćemo proširiti
    return XmlTransformer.transformDespatch(advice);
  }
}
