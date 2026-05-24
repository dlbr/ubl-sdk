import { Invoice, Party, InvoiceLine } from '../models/Invoice.js';
import { TaxCalculator, TaxGroup } from '../services/TaxCalculator.js';
import { PAYMENT_MEANS } from '../constants.js';

/**
 * XmlTransformer - Sklapa "Iron Wall" UBL 2.1 XML za srpski SEF.
 */
export class XmlTransformer {
  static toUblXml(invoice: Invoice): string {
    const direction = invoice.documentDirection || 'POZITIVAN';
    const taxGroups = TaxCalculator.calculate(invoice.lines, direction);
    const taxTotalAmount = TaxCalculator.sumTax(taxGroups);
    const netTotalAmount = invoice.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0) * (direction === 'NEGATIVAN' ? -1 : 1);
    const grossTotalAmount = netTotalAmount + taxTotalAmount;

    const root = invoice.typeCode === '381' ? 'CreditNote' : 'Invoice';
    const isCN = root === 'CreditNote';
    
    // 1. Extensions (SrbDtExt)
    const extensions = this.generateExtensions(invoice, taxTotalAmount);
    
    // 2. Core Metadata
    const id = `<cbc:ID>${invoice.id}</cbc:ID>`;
    const issueDate = `<cbc:IssueDate>${invoice.issueDate}</cbc:IssueDate>`;
    const typeCode = `<cbc:${root}TypeCode>${invoice.typeCode}</cbc:${root}TypeCode>`;
    const currency = `<cbc:DocumentCurrencyCode>${invoice.currency || 'RSD'}</cbc:DocumentCurrencyCode>`;
    const customization = `<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.rs:srbdt:2.1</cbc:CustomizationID>`;
    
    // 3. Parties
    const seller = this.generateParty('AccountingSupplierParty', invoice.seller);
    const buyer = this.generateParty('AccountingCustomerParty', invoice.buyer);
    
    // 4. Delivery & Payment & Period
    const delivery = invoice.deliveryDate ? `<cac:Delivery><cbc:ActualDeliveryDate>${invoice.deliveryDate}</cbc:ActualDeliveryDate></cac:Delivery>` : '';
    const payment = `<cac:PaymentMeans><cbc:PaymentMeansCode>${PAYMENT_MEANS.CREDIT_TRANSFER}</cbc:PaymentMeansCode></cac:PaymentMeans>`;
    const period = invoice.invoicePeriod ? `
  <cac:InvoicePeriod>
    <cbc:StartDate>${invoice.invoicePeriod.startDate}</cbc:StartDate>
    <cbc:EndDate>${invoice.invoicePeriod.endDate}</cbc:EndDate>
    <cbc:DescriptionCode>35</cbc:DescriptionCode>
  </cac:InvoicePeriod>` : '';
    
    // 5. Totals
    const taxTotal = this.generateTaxTotal(taxGroups, taxTotalAmount, invoice.currency);
    const monetaryTotal = isCN 
      ? this.generateMonetaryTotalCreditNote(netTotalAmount, taxTotalAmount, grossTotalAmount, invoice.currency)
      : this.generateMonetaryTotalInvoice(netTotalAmount, taxTotalAmount, grossTotalAmount, invoice.currency);
    
    // 6. Lines
    const lines = this.generateLines(invoice.lines, invoice.currency, isCN);

    return `<?xml version="1.0" encoding="utf-8"?>
<${root} 
  xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:cec="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
  xmlns:sbt="http://faktura.mfin.gov.rs/sefs/ubl/standard-business-document-extension-2">
  ${extensions}
  ${customization}
  ${id}
  ${issueDate}
  ${typeCode}
  ${currency}
  ${period}
  ${seller}
  ${buyer}
  ${delivery}
  ${payment}
  ${taxTotal}
  ${monetaryTotal}
  ${lines}
</${root}>`.trim();
  }

  private static generateExtensions(invoice: Invoice, taxAmount: number): string {
    if (!invoice.billingReference?.id && taxAmount === 0) return '';
    return `
  <cec:UBLExtensions>
    <cec:UBLExtension>
      <cec:ExtensionContent>
        <sbt:SrbDtExt>
          <sbt:InvoicedPrepaymentAmount>
            <cbc:ID>${invoice.billingReference?.id || 'AV-REF'}</cbc:ID>
            <cac:TaxTotal><cbc:TaxAmount currencyID="${invoice.currency}">${taxAmount.toFixed(2)}</cbc:TaxAmount></cac:TaxTotal>
          </sbt:InvoicedPrepaymentAmount>
        </sbt:SrbDtExt>
      </cec:ExtensionContent>
    </cec:UBLExtension>
  </cec:UBLExtensions>`;
  }

  private static generateParty(tag: string, party: Party): string {
    const partyIdent = party.jbkjs 
      ? `<cac:PartyIdentification><cbc:ID>JBKJS:${party.jbkjs}</cbc:ID></cac:PartyIdentification>`
      : (party.maticniBroj ? `<cac:PartyIdentification><cbc:ID>${party.maticniBroj}</cbc:ID></cac:PartyIdentification>` : '');

    return `
  <cac:${tag}>
    <cac:Party>
      <cbc:EndpointID schemeID="9948">${party.pib}</cbc:EndpointID>
      ${partyIdent}
      <cac:PostalAddress>
        <cbc:StreetName>${party.address || 'Ulica'}</cbc:StreetName>
        <cbc:CityName>${party.city || 'Grad'}</cbc:CityName>
        <cbc:PostalZone>${party.zip || '11000'}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>RS</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme><cbc:CompanyID>RS${party.pib}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${party.name}</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:${tag}>`;
  }

  private static generateTaxTotal(groups: TaxGroup[], totalTax: number, currency: string): string {
    const subtotals = groups.map(g => `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currency}">${g.taxableAmount.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currency}">${g.taxAmount.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${g.taxCategory}</cbc:ID>
        <cbc:Percent>${g.taxRate.toFixed(2)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`).join('');

    return `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${totalTax.toFixed(2)}</cbc:TaxAmount>
    ${subtotals}
  </cac:TaxTotal>`;
  }

  private static generateMonetaryTotalInvoice(net: number, tax: number, gross: number, currency: string): string {
    return `
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${net.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${net.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${gross.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${currency}">${gross.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;
  }

  private static generateMonetaryTotalCreditNote(net: number, tax: number, gross: number, currency: string): string {
    return `
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${net.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${net.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${gross.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${currency}">${gross.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;
  }

  private static generateLines(lines: InvoiceLine[], currency: string, isCN: boolean): string {
    const tag = isCN ? 'CreditNoteLine' : 'InvoiceLine';
    const qtyTag = isCN ? 'CreditedQuantity' : 'InvoicedQuantity';

    return lines.map((l, i) => {
      const exemption = l.taxExemptionReason ? `<cbc:TaxExemptionReasonCode>${l.taxExemptionReason}</cbc:TaxExemptionReasonCode>` : '';
      const lineId = l.id || (i + 1).toString();
      return `
  <cac:${tag}>
    <cbc:ID>${lineId}</cbc:ID>
    <cbc:${qtyTag} unitCode="${l.unitCode || 'H87'}">${l.quantity}</cbc:${qtyTag}>
    <cbc:LineExtensionAmount currencyID="${currency}">${(l.quantity * l.unitPrice).toFixed(2)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${l.description}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${l.taxCategory}</cbc:ID>
        <cbc:Percent>${(l.taxCategory === 'N' ? 0 : l.taxRate).toFixed(2)}</cbc:Percent>
        ${exemption}
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${currency}">${l.unitPrice.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:${tag}>`;
    }).join('');
  }
}
