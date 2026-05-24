import { InvoiceLine, SefPoreskaKategorija } from '../models/Invoice.js';

export interface TaxGroup {
  taxRate: number;
  taxCategory: SefPoreskaKategorija;
  taxableAmount: number;
  taxAmount: number;
}

/**
 * TaxCalculator - Deterministička agregacija poreza za SEF/UBL 2.1
 */
export class TaxCalculator {
  static calculate(lines: InvoiceLine[], direction: 'POZITIVAN' | 'NEGATIVAN' = 'POZITIVAN'): TaxGroup[] {
    const groups: Map<string, TaxGroup> = new Map();
    const sign = direction === 'NEGATIVAN' ? -1 : 1;

    for (const line of lines) {
      // Rule: In CreditNote (NEGATIVAN), we might want to force positive quantity/price but implicitly negative.
      // However, SEF Konacni (POZITIVAN) uses negative lines for reduction.
      const taxable = (line.quantity * line.unitPrice) * (direction === 'NEGATIVAN' ? -1 : 1);
      // Force 0 tax for specific categories (N, E, etc.)
      const isZeroTax = ['N', 'E', 'Z', 'R', 'OE'].includes(line.taxCategory);
      const tax = isZeroTax ? 0 : taxable * (line.taxRate / 100);
      
      // SEF Rule: Category N MUST have 0.00% tax rate in XML, regardless of what's passed
      const actualTaxRate = line.taxCategory === 'N' ? 0 : line.taxRate;

      const key = `${line.taxCategory}-${actualTaxRate}`;

      if (!groups.has(key)) {
        groups.set(key, { 
          taxRate: actualTaxRate, 
          taxCategory: line.taxCategory, 
          taxableAmount: 0, 
          taxAmount: 0 
        });
      }

      const group = groups.get(key)!;
      group.taxableAmount += taxable;
      group.taxAmount += tax;
    }

    return Array.from(groups.values());
  }

  static sumTax(groups: TaxGroup[]): number {
    return groups.reduce((sum, g) => sum + g.taxAmount, 0);
  }

  static sumTotal(groups: TaxGroup[]): number {
    return groups.reduce((sum, g) => sum + g.taxableAmount + g.taxAmount, 0);
  }
}
