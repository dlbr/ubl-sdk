import * as v from 'valibot';
import { validanPIB } from '../validator.js';

/**
 * Poreski JSON Builder za EEO (Evidencija elektronskih obaveza) i EPP (Evidencija prethodnog poreza).
 * Refactored v6.5.4 - Titanium Standard with Full Category Support.
 */
export class SefPoreskiJsonBuilder {
  private static num(val: any, fallback: number = 0): number {
    const n = parseFloat(val);
    return isNaN(n) ? fallback : n;
  }

  /**
   * Zbirna EEO (Individualna interna faktura nije potrebna)
   */
  static buildZbirniEeoPayload(data: any) {
    // 1. Validation Schema
    const Schema = v.object({
      poreskiPeriod: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}$/, 'INVALID_PERIOD_FORMAT')),
      osnovicaOpsta: v.optional(v.number()),
      pdvOpsta: v.optional(v.number()),
      osnovicaPosebna: v.optional(v.number()),
      pdvPosebna: v.optional(v.number()),
      osnovicaOslobodjena: v.optional(v.number()),
      pib: v.optional(v.pipe(v.string(), v.check(validanPIB, 'INVALID_PIB_FORMAT'))),
      supplierPib: v.optional(v.pipe(v.string(), v.check(validanPIB, 'INVALID_PIB_FORMAT'))),
      customerPib: v.optional(v.pipe(v.string(), v.check(validanPIB, 'INVALID_PIB_FORMAT'))),
      poreskaKategorija: v.optional(v.pipe(v.string(), v.check(val => ["S", "E", "AE", "Z", "OE", "R", "G", "O", "N"].includes(val), 'INVALID_TAX_CATEGORY')))
    });

    const validated = v.parse(Schema, data);
    const [y, m] = validated.poreskiPeriod.split('-').map(Number);
    
    // Safety check for future periods
    const now = new Date();
    if (y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth() + 1)) {
      throw new Error('FUTURE_PERIOD');
    }

    const payload: any = {
      Year: y, Month: m,
      TaxRecords: [
        { Category: 'S20', TaxRatePercentage: 20, Amount: this.num(validated.osnovicaOpsta), TaxAmount: this.num(validated.pdvOpsta) },
        { Category: 'S10', TaxRatePercentage: 10, Amount: this.num(validated.osnovicaPosebna), TaxAmount: this.num(validated.pdvPosebna) }
      ]
    };

    if (validated.osnovicaOslobodjena || validated.poreskaKategorija === 'E') {
      payload.TaxRecords.push({ Category: 'E0', TaxRatePercentage: 0, Amount: this.num(validated.osnovicaOslobodjena), TaxAmount: 0 });
    }

    // SrbDtExt handling for specific scenarios (e.g. Credit Notes or explicit reference)
    if (data.referentniRacun || data.invoiceTypeCode === '381') {
      payload.SrbDtExt = {
        ReferentniRacun: data.referentniRacun || 'N/A'
      };
    }

    return payload;
  }

  /**
   * Pojedinačna EEO (Pojedinačna interna faktura)
   */
  static buildPojedinacnaEeoPayload(data: any) {
    const period = data.poreskiPeriod || '2026-06';
    const [y, m] = period.split('-').map(Number);
    const isCN = data.invoiceTypeCode === '381';

    // Strict validation for Individual Internal Invoices
    if (data.isIndividual && data.invoiceTypeCode !== '381' && data.invoiceTypeCode !== '383') {
       throw new Error('INVALID_INVOICE_TYPE_FOR_INDIVIDUAL');
    }

    const payload: any = {
      Year: y, Month: m,
      InternalInvoiceNumber: data.internalInvoiceNumber || `INT-STATIC-ID`,
      TaxRecords: [
        { 
          TaxCategory: data.poreskaKategorija || 'S20',
          Amount: isCN ? -Math.abs(this.num(data.osnovicaOpsta)) : this.num(data.osnovicaOpsta),
          TaxAmount: isCN ? -Math.abs(this.num(data.pdvOpsta)) : this.num(data.pdvOpsta)
        }
      ]
    };

    return payload;
  }

  /**
   * EPP (Evidencija prethodnog poreza)
   */
  static buildEppPayload(data: any) {
    // Basic validation for EPP
    if (!data.poreskiPeriod || !data.dobavljacPib) {
      throw new Error('INVALID_EPP_DATA');
    }

    const [y, m] = data.poreskiPeriod.split('-').map(Number);
    return {
      Year: y, Month: m,
      InputTaxRecords: [
        { Type: "PurchaseInvoiced", TaxAmount: this.num(data.prethodniPorezOdObveznika) },
        { Type: "Import", TaxAmount: this.num(data.importPdvCarina) }
      ]
    };
  }
}
