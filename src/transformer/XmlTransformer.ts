import type { Invoice, Party, InvoiceLine } from '../models/Invoice.js';
import { TaxCalculator } from '../services/TaxCalculator.js';
import type { TaxGroup } from '../services/TaxCalculator.js';
import { PAYMENT_MEANS } from '../constants.js';

/**
 * XmlTransformer - Sklapa "Iron Wall" UBL 2.1 XML za srpski SEF.
 */
export class XmlTransformer {
  static toUblXml(invoice: Invoice): string {
    const direction = invoice.documentDirection || 'POZITIVAN';
    const taxGroups = TaxCalculator.calculate(invoice.lines, direction);
    const taxTotalAmount = TaxCalculator.sumTax(taxGroups);
    const netTotalAmount = invoice.lines.reduce((sum, l) => sum + (l.quantity * l.unitPrice), 0) * (direction === 'NEGATIVAN' ? -1 : 1);
    const grossTotalAmount = netTotalAmount + taxTotalAmount;

    const root = invoice.typeCode === '381' ? 'CreditNote' : 'Invoice';
    const isCN = root === 'CreditNote';
    const is386 = invoice.typeCode === '386';
    
    // 1. Extensions (SrbDtExt)
    const extensions = this.generateExtensions(invoice, netTotalAmount, taxTotalAmount, grossTotalAmount);
    
    // 2. Core Metadata
    const id = `<cbc:ID>${invoice.id}</cbc:ID>`;
    const issueDate = `<cbc:IssueDate>${invoice.issueDate}</cbc:IssueDate>`;
    const dueDate = (!isCN && invoice.dueDate) ? `\n  <cbc:DueDate>${invoice.dueDate}</cbc:DueDate>` : '';
    
    const typeCodeTag = isCN ? 'CreditNoteTypeCode' : 'InvoiceTypeCode';
    const typeCode = `<cbc:${typeCodeTag}>${invoice.typeCode}</cbc:${typeCodeTag}>`;
    
    // Support multiple notes (e.g. for PFR references)
    const notes = (invoice.notes || []).map(n => `\n  <cbc:Note>${n}</cbc:Note>`).join('');

    const currency = `<cbc:DocumentCurrencyCode>${invoice.currency || 'RSD'}</cbc:DocumentCurrencyCode>`;
    const customization = `<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.rs:srbdt:2.1</cbc:CustomizationID>`;
    
    // 2.5 Exchange Rate
    const exchangeRate = (invoice.currency && invoice.currency !== 'RSD' && invoice.exchangeRate) ? `
  <cac:PaymentExchangeRate>
    <cbc:SourceCurrencyCode>${invoice.currency}</cbc:SourceCurrencyCode>
    <cbc:TargetCurrencyCode>RSD</cbc:TargetCurrencyCode>
    <cbc:CalculationRate>${invoice.exchangeRate}</cbc:CalculationRate>
  </cac:PaymentExchangeRate>` : '';
    
    // 3. Parties
    const seller = this.generateParty('AccountingSupplierParty', invoice.seller);
    const buyer = this.generateParty('AccountingCustomerParty', invoice.buyer);
    
    // 3.5 Billing Reference
    const billingRef = invoice.billingReference ? `
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${invoice.billingReference.id}</cbc:ID>
      <cbc:IssueDate>${invoice.billingReference.date || invoice.issueDate}</cbc:IssueDate>
      <cbc:DocumentTypeCode>${invoice.billingReference.typeCode || '380'}</cbc:DocumentTypeCode>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>` : '';
    
    // 4. Delivery & Payment & Period
    const delivery = invoice.deliveryDate ? `<cac:Delivery><cbc:ActualDeliveryDate>${invoice.deliveryDate}</cbc:ActualDeliveryDate></cac:Delivery>` : '';
    const payment = `
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>${PAYMENT_MEANS.CREDIT_TRANSFER}</cbc:PaymentMeansCode>
    <cac:PayeeFinancialAccount>
      <cbc:ID>${invoice.seller.bankAccount || '840-0000000000000-00'}</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>`;
    
    // SEF Rule: InvoicePeriod is mandatory for 380/383. CreditNote (381) and Advance (386) do NOT 
    // require it unless explicitly providing a period block (like SmanjenjeUPeriodu).
    // EXCEPT: For 386 with Category S, DescriptionCode IS required! BUT 35 and 43 are rejected.
    // Try code 3.
    const is380_383_386 = invoice.typeCode === '380' || invoice.typeCode === '383' || invoice.typeCode === '386';
    const skipPeriodDates = invoice.typeCode === '383' && !!invoice.billingReference;
    let period = '';
    
    if (is380_383_386 || invoice.invoicePeriod) {
      const start = invoice.invoicePeriod?.startDate || invoice.issueDate;
      const end = invoice.invoicePeriod?.endDate || invoice.issueDate;
      let descCode = '35';
      if (invoice.typeCode === '386') descCode = '432';
      const periodDesc = (invoice.typeCode === '381') ? '' : `\n    <cbc:DescriptionCode>${descCode}</cbc:DescriptionCode>`;
      
      if (skipPeriodDates) {
        period = `
  <cac:InvoicePeriod>${periodDesc}
  </cac:InvoicePeriod>`;
      } else {
        period = `
  <cac:InvoicePeriod>
    <cbc:StartDate>${start}</cbc:StartDate>
    <cbc:EndDate>${end}</cbc:EndDate>${periodDesc}
  </cac:InvoicePeriod>`;
      }
    }


    // 5. Totals
    const taxTotal = this.generateTaxTotal(taxGroups, taxTotalAmount, invoice.currency);
    const prepaidAmt = invoice.prepaymentReference ? (invoice.prepaymentReference.taxAmount * 5 + invoice.prepaymentReference.taxAmount) : 0; // gross amount of prepayment
    const monetaryTotal = isCN 
      ? this.generateMonetaryTotalCreditNote(netTotalAmount, taxTotalAmount, grossTotalAmount, invoice.currency)
      : this.generateMonetaryTotalInvoice(netTotalAmount, taxTotalAmount, grossTotalAmount, invoice.currency, prepaidAmt);

    // 6. Lines
    const lines = this.generateLines(invoice.lines, invoice.currency, isCN);

    return `<?xml version="1.0" encoding="utf-8"?>
<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:cec="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:sbt="http://mfin.gov.rs/srbdt/srbdtext">
  ${extensions}
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.rs:srbdt:2.1</cbc:CustomizationID>
  <cbc:ID>${invoice.id}</cbc:ID>
  <cbc:IssueDate>${invoice.issueDate}</cbc:IssueDate>${dueDate}
  <cbc:${typeCodeTag}>${invoice.typeCode}</cbc:${typeCodeTag}>${notes}
  <cbc:DocumentCurrencyCode>${invoice.currency || 'RSD'}</cbc:DocumentCurrencyCode>
  ${exchangeRate}
  ${period}
  ${billingRef}
  ${seller}
  ${buyer}
  ${delivery}
  ${payment}
  ${taxTotal}
  ${monetaryTotal}
  ${lines}
</${root}>`.trim();
  }

  private static generateExtensions(invoice: Invoice, netTotal: number, taxTotal: number, grossTotal: number): string {
    if (!invoice.prepaymentReference) return '';
    // SEF STRICT PARSER REQUIREMENT: xmlns:sbt MUST be locally defined on sbt:SrbDtExt,
    // EVEN THOUGH it is defined on the root. The SEF XML parser demands this specific node structure.
    const sbtNs = "http://mfin.gov.rs/srbdt/srbdtext";
    
    // Reverse calculate taxable amount based on taxAmount for 20% (assumption for now, or pass from model)
    const taxAmt = invoice.prepaymentReference.taxAmount;
    const taxableAmt = taxAmt * 5; // Assuming 20% tax
    
    const reducedTax = taxTotal - taxAmt;
    const reducedNet = netTotal - taxableAmt;
    const reducedGross = grossTotal - (taxAmt + taxableAmt);

    return `
  <cec:UBLExtensions>
    <cec:UBLExtension>
      <cec:ExtensionContent>
        <sbt:SrbDtExt xmlns:sbt="${sbtNs}">
          <sbt:InvoicedPrepaymentAmount>
            <cbc:ID>${invoice.prepaymentReference.id}</cbc:ID>
            <cac:TaxTotal>
              <cbc:TaxAmount currencyID="${invoice.currency}">${taxAmt.toFixed(2)}</cbc:TaxAmount>
              <cac:TaxSubtotal>
                <cbc:TaxableAmount currencyID="${invoice.currency}">${taxableAmt.toFixed(2)}</cbc:TaxableAmount>
                <cbc:TaxAmount currencyID="${invoice.currency}">${taxAmt.toFixed(2)}</cbc:TaxAmount>
                <cac:TaxCategory>
                  <cbc:ID>S</cbc:ID>
                  <cbc:Percent>20.00</cbc:Percent>
                  <cac:TaxScheme>
                    <cbc:ID>VAT</cbc:ID>
                  </cac:TaxScheme>
                </cac:TaxCategory>
              </cac:TaxSubtotal>
            </cac:TaxTotal>
          </sbt:InvoicedPrepaymentAmount>
          <sbt:ReducedTotals>
            <cac:TaxTotal>
              <cbc:TaxAmount currencyID="${invoice.currency}">${reducedTax.toFixed(2)}</cbc:TaxAmount>
              <cac:TaxSubtotal>
                <cbc:TaxableAmount currencyID="${invoice.currency}">${reducedNet.toFixed(2)}</cbc:TaxableAmount>
                <cbc:TaxAmount currencyID="${invoice.currency}">${reducedTax.toFixed(2)}</cbc:TaxAmount>
                <cac:TaxCategory>
                  <cbc:ID>S</cbc:ID>
                  <cbc:Percent>20.00</cbc:Percent>
                  <cac:TaxScheme>
                    <cbc:ID>VAT</cbc:ID>
                  </cac:TaxScheme>
                </cac:TaxCategory>
              </cac:TaxSubtotal>
            </cac:TaxTotal>
            <cac:LegalMonetaryTotal>
              <cbc:TaxExclusiveAmount currencyID="${invoice.currency}">${reducedNet.toFixed(2)}</cbc:TaxExclusiveAmount>
              <cbc:TaxInclusiveAmount currencyID="${invoice.currency}">${reducedGross.toFixed(2)}</cbc:TaxInclusiveAmount>
              <cbc:PayableAmount currencyID="${invoice.currency}">${reducedGross.toFixed(2)}</cbc:PayableAmount>
            </cac:LegalMonetaryTotal>
          </sbt:ReducedTotals>
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

  private static generateMonetaryTotalInvoice(net: number, tax: number, gross: number, currency: string, prepaidAmt: number = 0): string {
    const prepaidTag = prepaidAmt > 0 ? `\n    <cbc:PrepaidAmount currencyID="${currency}">${prepaidAmt.toFixed(2)}</cbc:PrepaidAmount>` : '';
    const payable = gross - prepaidAmt;
    return `
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${net.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${net.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${gross.toFixed(2)}</cbc:TaxInclusiveAmount>${prepaidTag}
    <cbc:PayableAmount currencyID="${currency}">${payable.toFixed(2)}</cbc:PayableAmount>
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
