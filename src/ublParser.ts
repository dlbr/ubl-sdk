// packages/ubl-sdk/src/ublParser.ts

export interface ParsedUblDocument {
  invoiceTypeCode: string;
  payableAmount: number;
  allowanceTotalAmount: number;
  taxAmount: number;
  currency: string;
  taxSubtotals: Array<{
    taxCategoryCode: string;
    taxCategoryPercent: number;
    taxableAmount: number;
    taxAmount: number;
  }>;
  billingReference?: string;
  taxAmountRsd?: number;
  taxAmountEur?: number;
  prepaymentReferences?: Array<{ amount: number }>;
}

function getTagValue(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`));
  return match ? match[1].trim() : '';
}

export async function parseUblXml(siroviXml: string): Promise<ParsedUblDocument> {
  let invoiceType = getTagValue(siroviXml, 'cbc:InvoiceTypeCode');
  if (!invoiceType) {
    invoiceType = getTagValue(siroviXml, 'cbc:CreditNoteTypeCode');
  }

  const valutaMatch = siroviXml.match(/currencyID="([^"]+)"/);
  const currency = valutaMatch ? valutaMatch[1] : 'RSD';
  const payableAmount = parseFloat(getTagValue(siroviXml, 'cbc:PayableAmount') || '0');
  const allowanceTotalAmount = parseFloat(getTagValue(siroviXml, 'cbc:AllowanceTotalAmount') || '0');
  
  let taxAmount = 0;
  let taxAmountRsd = 0;
  let taxAmountEur = 0;

  const taxTotalMatches = siroviXml.match(/<cac:TaxTotal>[\s\S]*?<\/cac:TaxTotal>/g) || [];
  
  for (const taxTotalXml of taxTotalMatches) {
    const amount = parseFloat(getTagValue(taxTotalXml, 'cbc:TaxAmount') || '0');
    const curr = taxTotalXml.match(/currencyID="([^"]+)"/)?.[1];
    
    if (curr === 'RSD') taxAmountRsd = amount;
    if (curr === 'EUR') taxAmountEur = amount;
    taxAmount = amount;
  }

  const taxSubtotals: ParsedUblDocument['taxSubtotals'] = [];
  const subtotalMatches = siroviXml.match(/<cac:TaxSubtotal>[\s\S]*?<\/cac:TaxSubtotal>/g) || [];

  for (const subtotalXml of subtotalMatches) {
    const taxCategoryCode = getTagValue(subtotalXml, 'cbc:ID');
    const taxCategoryPercent = parseFloat(getTagValue(subtotalXml, 'cbc:Percent') || '0');
    const taxableAmount = parseFloat(getTagValue(subtotalXml, 'cbc:TaxableAmount') || '0');
    const subTaxAmount = parseFloat(getTagValue(subtotalXml, 'cbc:TaxAmount') || '0');

    if (taxCategoryCode) {
      taxSubtotals.push({ taxCategoryCode, taxCategoryPercent, taxableAmount, taxAmount: subTaxAmount });
    }
  }

  const billingRefMatch = siroviXml.match(/<cac:BillingReference>[\s\S]*?<cbc:ID>([^<]+)<\/cbc:ID>/);
  const billingReference = billingRefMatch ? billingRefMatch[1].trim() : undefined;
  
  const prepaymentReferences: Array<{ amount: number }> = [];
  const prepaymentMatch = siroviXml.match(/<sbt:PrepaidAmount[^>]*>([^<]*)<\/sbt:PrepaidAmount>/);
  if (prepaymentMatch) {
    prepaymentReferences.push({ amount: parseFloat(prepaymentMatch[1]) });
  }

  return {
    invoiceTypeCode: invoiceType,
    payableAmount,
    allowanceTotalAmount,
    taxAmount,
    currency,
    taxSubtotals,
    billingReference,
    taxAmountRsd: taxAmountRsd || undefined,
    taxAmountEur: taxAmountEur || undefined,
    prepaymentReferences: prepaymentReferences.length > 0 ? prepaymentReferences : undefined
  };
}
