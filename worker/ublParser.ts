import * as v from 'valibot';

// Valibot šeme za tipizaciju sa ugrađenim pipeline čišćenjem od NaN anomalija
export const ParsedItemSchema = v.object({
  itemName: v.string(),
  quantity: v.pipe(v.number(), v.check(n => !isNaN(n), "Quantity ne sme biti NaN")),
  unitCode: v.string(),
  lineExtensionAmount: v.pipe(v.number(), v.check(n => !isNaN(n), "Line amount ne sme biti NaN")),
  taxPercent: v.pipe(v.number(), v.check(n => !isNaN(n), "Tax percent ne sme biti NaN")),
  taxAmount: v.pipe(v.number(), v.check(n => !isNaN(n), "Tax amount ne sme biti NaN")),
});

export const ParsedTaxSchema = v.object({
  taxableAmount: v.pipe(v.number(), v.check(n => !isNaN(n), "Taxable amount ne sme biti NaN")),
  taxAmount: v.pipe(v.number(), v.check(n => !isNaN(n), "Tax amount ne sme biti NaN")),
  taxPercentage: v.pipe(v.number(), v.check(n => !isNaN(n), "Tax percentage ne sme biti NaN")),
  taxCategoryCode: v.string(),
});

export const UblExtractionSchema = v.object({
  invoiceId: v.string(),
  items: v.array(ParsedItemSchema),
  taxes: v.array(ParsedTaxSchema),
});

export type UblExtraction = v.InferOutput<typeof UblExtractionSchema>;

export class SefUblParser {
  
  public static async parseInvoice(xml: string): Promise<any> {
    const extraction = this.extract(xml, "ASYNC-SYNC");
    
    // Map extraction to the structure expected by KlijentBazaObject
    return {
      ID: extraction.invoiceId || this.getFlexibleTagValue(xml, 'ID'),
      SupplierPib: this.getFlexibleTagValue(xml, 'EndpointID'), // Simplistic, but matches current logic
      IssueDate: this.getFlexibleTagValue(xml, 'IssueDate'),
      PayableAmount: parseFloat(this.getFlexibleTagValue(xml, 'PayableAmount') || '0'),
      TaxTotals: [{
        Subtotals: extraction.taxes.map(t => ({
          TaxableAmount: t.taxableAmount,
          TaxAmount: t.taxAmount,
          Percent: t.taxPercentage,
          Category: t.taxCategoryCode
        }))
      }]
    };
  }

  public static extract(xml: string, invoiceId: string): UblExtraction {
    const items: v.InferOutput<typeof ParsedItemSchema>[] = [];
    const taxes: v.InferOutput<typeof ParsedTaxSchema>[] = [];

    // Stabilizacija bele površine bez urušavanja unutrašnjih tekstualnih vrednosti
    const cleanXml = xml.replace(/>\s+</g, '><');

    // 1. Ekstrakcija stavki nezavisna od namespace-a
    const invoiceLineRegex = /<[^>]*?InvoiceLine\b[^>]*>([\s\S]*?)<\/[^>]*?InvoiceLine>/g;
    let match;
    
    while ((match = invoiceLineRegex.exec(cleanXml)) !== null) {
      try {
        if (match[1]) {
          items.push(this.parseInvoiceLine(match[1]));
        }
      } catch (lineError) {
        // Logujemo i izolujemo neispravnu stavku, ne rušimo ceo parser
        console.error(`[UBL Parser stavka korupcija] Preskačem stavku na fakturi ${invoiceId}`);
      }
    }

    // 2. Hirurška izolacija KORENSKOG TaxTotal bloka
    // Da bismo izbegli mešanje sa stavkama, tražimo isključivo prostor nakon poslednje zatvorene stavke
    const lastLineIdx = cleanXml.lastIndexOf('</');
    const rootSearchScope = lastLineIdx !== -1 ? cleanXml.substring(lastLineIdx) : cleanXml;

    // Alternativni oklop: ako nema stavki, koristimo poziciju pre LegalMonetaryTotal
    const monetaryTotalIdx = cleanXml.search(/<[^>]*?LegalMonetaryTotal\b/);
    const finalScope = monetaryTotalIdx !== -1 ? cleanXml.substring(0, monetaryTotalIdx) : rootSearchScope;

    const rootTaxTotalMatches = Array.from(finalScope.matchAll(/<[^>]*?TaxTotal\b[^>]*>([\s\S]*?)<\/[^>]*?TaxTotal>/g));
    const lastTaxTotal = rootTaxTotalMatches[rootTaxTotalMatches.length - 1];

    if (lastTaxTotal && lastTaxTotal[1]) {
      const rootTaxTotalXml = lastTaxTotal[1];
      const taxSubtotalRegex = /<[^>]*?TaxSubtotal\b[^>]*>([\s\S]*?)<\/[^>]*?TaxSubtotal>/g;
      let taxMatch;
      
      while ((taxMatch = taxSubtotalRegex.exec(rootTaxTotalXml)) !== null) {
        try {
          if (taxMatch[1]) {
            taxes.push(this.parseTaxSubtotal(taxMatch[1]));
          }
        } catch (taxError) {
          console.error(`[UBL Parser porez korupcija] Greška u poreskom bloku na fakturi ${invoiceId}`);
        }
      }
    }

    // 3. Valibot Validacija (Zadnja linija odbrane)
    const result = v.safeParse(UblExtractionSchema, { invoiceId, items, taxes });
    if (!result.success) {
      throw new Error(`UBL Forensic Match Failure: ${JSON.stringify(result.issues)}`);
    }

    return result.output;
  }

  private static parseInvoiceLine(lineXml: string): v.InferOutput<typeof ParsedItemSchema> {
    const itemName = this.getFlexibleTagValue(lineXml, 'Name') || 'Nepoznata stavka';
    
    const quantityTagMatch = lineXml.match(/<[^>]*?InvoicedQuantity\b([^>]*?)>/i);
    let unitCode = 'H87';
    if (quantityTagMatch) {
      const attrContent = quantityTagMatch[1];
      const unitCodeMatch = attrContent ? attrContent.match(/unitCode\s*=\s*["']([^"']+)["']/i) : null;
      if (unitCodeMatch && unitCodeMatch[1]) unitCode = unitCodeMatch[1];    }

    // Defanzivno kastovanje sa osiguračem protiv NaN anomalije
    const parseSafeFloat = (val: string | null): number => {
      if (!val) return 0;
      return parseFloat(val);
    };

    const quantity = parseSafeFloat(this.getFlexibleTagValue(lineXml, 'InvoicedQuantity'));
    const lineExtensionAmount = parseSafeFloat(this.getFlexibleTagValue(lineXml, 'LineExtensionAmount'));
    const taxPercent = parseSafeFloat(this.getFlexibleTagValue(lineXml, 'Percent'));
    const taxAmount = parseSafeFloat(this.getFlexibleTagValue(lineXml, 'TaxAmount'));

    return { itemName, quantity, unitCode, lineExtensionAmount, taxPercent, taxAmount };
  }

  private static parseTaxSubtotal(taxXml: string): v.InferOutput<typeof ParsedTaxSchema> {
    const parseSafeFloat = (val: string | null): number => {
      if (!val) return 0;
      return parseFloat(val);
    };

    const taxableAmount = parseSafeFloat(this.getFlexibleTagValue(taxXml, 'TaxableAmount'));
    const taxAmount = parseSafeFloat(this.getFlexibleTagValue(taxXml, 'TaxAmount'));
    const taxPercentage = parseSafeFloat(this.getFlexibleTagValue(taxXml, 'Percent'));
    
    const taxSchemeStart = taxXml.search(/<[^>]*?TaxScheme\b/);
    const scopeXml = taxSchemeStart !== -1 ? taxXml.substring(0, taxSchemeStart) : taxXml;
    const taxCategoryCode = this.getFlexibleTagValue(scopeXml, 'ID') || 'S';

    return { taxableAmount, taxAmount, taxPercentage, taxCategoryCode };
  }

  private static getFlexibleTagValue(xml: string, localName: string): string | null {
    // Striktno mečovanje bez probijanja unutrašnjih tagova
    const regex = new RegExp(`<[^>]*?${localName}\\b[^>]*>([^<]*?)<\\/[^>]*?${localName}>`, 'i');
    const match = xml.match(regex);
    return (match && match[1]) ? match[1].trim() : null;
  }
}