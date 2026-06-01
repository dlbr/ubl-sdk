import type { Invoice, Party, InvoiceLine } from '../models/Invoice.js';
import type { DespatchAdvice, DespatchLine } from '../models/DespatchAdvice.js';
import { TaxCalculator } from '../services/TaxCalculator.js';
import type { TaxGroup } from '../services/TaxCalculator.js';
import { PAYMENT_MEANS } from '../constants.js';
import type { ReceiptAdvice, ReceiptLine } from '../models/ReceiptAdvice.js';
import type { SefApplicationResponseInput } from '../validator.js';

/**
 * XmlTransformer - Generates UBL 2.1 XML for Serbian SEF.
 */
export class XmlTransformer {
  static toUblXml(invoice: Invoice): string {
    const direction = invoice.documentDirection || 'POZITIVAN';
    const taxGroups = TaxCalculator.calculate(invoice.lines, direction);
    const taxTotalAmount = TaxCalculator.sumTax(taxGroups);
    const netTotalAmount = invoice.lines.reduce((sum, l) => sum + (l.quantity * l.unitPrice), 0);
    const grossTotalAmount = netTotalAmount + taxTotalAmount;

    const root = invoice.typeCode === '381' ? 'CreditNote' : 'Invoice';
    const isCN = root === 'CreditNote';
    
    const extensions = this.generateInvoiceExtensions(invoice);
    
    const id = `<cbc:ID>${invoice.id}</cbc:ID>`;
    const issueDate = `<cbc:IssueDate>${invoice.issueDate}</cbc:IssueDate>`;
    const dueDate = (!isCN && invoice.dueDate) ? `\n  <cbc:DueDate>${invoice.dueDate}</cbc:DueDate>` : '';
    
    const typeCodeTag = isCN ? 'CreditNoteTypeCode' : 'InvoiceTypeCode';
    const typeCode = `<cbc:${typeCodeTag}>${invoice.typeCode}</cbc:${typeCodeTag}>`;
    const notes = (invoice.notes || []).map(n => `\n  <cbc:Note>${n}</cbc:Note>`).join('');
    const currency = `<cbc:DocumentCurrencyCode>${invoice.currency || 'RSD'}</cbc:DocumentCurrencyCode>`;
    
    const seller = this.generateParty('AccountingSupplierParty', invoice.seller);
    const buyer = this.generateParty('AccountingCustomerParty', invoice.buyer);
    
    const billingRef = invoice.billingReference ? `
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${invoice.billingReference.id}</cbc:ID>
      <cbc:IssueDate>${invoice.billingReference.date || invoice.issueDate}</cbc:IssueDate>
      <cbc:DocumentTypeCode>${invoice.billingReference.typeCode || '380'}</cbc:DocumentTypeCode>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>` : '';
    
    const delivery = (invoice.deliveryDate && invoice.typeCode !== '386')
      ? `<cac:Delivery><cbc:ActualDeliveryDate>${invoice.deliveryDate}</cbc:ActualDeliveryDate></cac:Delivery>`
      : '';
    const payment = `
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>${PAYMENT_MEANS.CREDIT_TRANSFER}</cbc:PaymentMeansCode>
    <cac:PayeeFinancialAccount>
      <cbc:ID>${invoice.seller.bankAccount || '840-0000000000000-00'}</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>`;

    const taxTotal = this.generateTaxTotal(taxGroups, taxTotalAmount, invoice.currency);
    
    let prepaidAmount = 0;
    if (invoice.prepaymentReference) {
       prepaidAmount = (invoice as any).prepaidAmount || 0;
    }
    const monetaryTotal = this.generateMonetaryTotal(netTotalAmount, taxTotalAmount, grossTotalAmount, invoice.currency, isCN, prepaidAmount);
    const lines = this.generateInvoiceLines(invoice.lines, invoice.currency, isCN);

    return `<?xml version="1.0" encoding="utf-8"?>
<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:cec="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:sbt="http://mfin.gov.rs/srbdt/srbdtext">
  ${extensions}
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.rs:srbdt:2.1</cbc:CustomizationID>
  ${id}
  ${issueDate}${dueDate}
  ${typeCode}${notes}
  ${currency}
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

  private static generateInvoiceExtensions(invoice: Invoice): string {
    if (!invoice.prepaymentReference) return '';
    const sbtNs = "http://mfin.gov.rs/srbdt/srbdtext";
    return `
  <cec:UBLExtensions>
    <cec:UBLExtension>
      <cec:ExtensionContent>
        <sbt:SrbDtExt xmlns:sbt="${sbtNs}">
          <sbt:InvoicedPrepaymentAmount>
            <cbc:ID>${invoice.prepaymentReference.id}</cbc:ID>
            <cac:TaxTotal>
              <cbc:TaxAmount currencyID="${invoice.currency}">${(invoice.prepaymentReference as any).taxAmount?.toFixed(2) || '0.00'}</cbc:TaxAmount>
            </cac:TaxTotal>
          </sbt:InvoicedPrepaymentAmount>
        </sbt:SrbDtExt>
      </cec:ExtensionContent>
    </cec:UBLExtension>
  </cec:UBLExtensions>`;
  }

  private static generateParty(tag: string, party: Party): string {
    return `
  <cac:${tag}>
    <cac:Party>
      <cbc:EndpointID schemeID="9948">${party.pib}</cbc:EndpointID>
      <cac:PartyIdentification><cbc:ID>${party.maticniBroj || '00000000'}</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${party.name}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${party.address || 'Ulica'}</cbc:StreetName>
        <cbc:CityName>${party.city || 'Grad'}</cbc:CityName>
        <cbc:PostalZone>${party.zip || '11000'}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>RS</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme><cbc:CompanyID>RS${party.pib}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${party.name}</cbc:RegistrationName>
        <cbc:CompanyID>${party.maticniBroj || '00000000'}</cbc:CompanyID>
      </cac:PartyLegalEntity>
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

  private static generateMonetaryTotal(net: number, tax: number, gross: number, currency: string, isCN: boolean, prepaidAmount: number = 0): string {
    const prepaidTag = prepaidAmount > 0 ? `\n    <cbc:PrepaidAmount currencyID="${currency}">${prepaidAmount.toFixed(2)}</cbc:PrepaidAmount>` : '';
    const payable = gross - prepaidAmount;
    return `
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${net.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${net.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${gross.toFixed(2)}</cbc:TaxInclusiveAmount>${prepaidTag}
    <cbc:PayableAmount currencyID="${currency}">${payable.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;
  }

  private static generateInvoiceLines(lines: InvoiceLine[], currency: string, isCN: boolean): string {
    const tag = isCN ? 'CreditNoteLine' : 'InvoiceLine';
    const qtyTag = isCN ? 'CreditedQuantity' : 'InvoicedQuantity';

    return lines.map((l, i) => {
      const exemption = l.taxExemptionReasonCode ? `<cbc:TaxExemptionReasonCode>${l.taxExemptionReasonCode}</cbc:TaxExemptionReasonCode>` : (l.taxExemptionReason ? `<cbc:TaxExemptionReason>${l.taxExemptionReason}</cbc:TaxExemptionReason>` : '');
      return `
  <cac:${tag}>
    <cbc:ID>${l.id || (i + 1)}</cbc:ID>
    <cbc:${qtyTag} unitCode="${l.unitCode || 'H87'}">${l.quantity}</cbc:${qtyTag}>
    <cbc:LineExtensionAmount currencyID="${currency}">${(l.quantity * l.unitPrice).toFixed(2)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${l.description}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${l.taxCategory}</cbc:ID>
        <cbc:Percent>${l.taxRate.toFixed(2)}</cbc:Percent>
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

  static transformReceipt(receipt: ReceiptAdvice): string {
    const root = 'ReceiptAdvice';
    const sbtNs = "http://mfin.gov.rs/srbdt/srbdtext";
    
    const lineCount = receipt.lines?.length || 0;
    
    let extensionContent = `\n          <sbt:ShipmentMethod><cbc:ShipmentMethodType>${receipt.shipmentMethod || '1'}</cbc:ShipmentMethodType></sbt:ShipmentMethod>`;
    
    if (receipt.frameworkAgreementId || receipt.contractId) {
      extensionContent += `\n          <sbt:ExtDocuments>`;
      if (receipt.frameworkAgreementId) extensionContent += `\n            <cac:OriginatorDocumentReference><cbc:ID>${receipt.frameworkAgreementId}</cbc:ID></cac:OriginatorDocumentReference>`;
      if (receipt.contractId) extensionContent += `\n            <cac:ContractDocumentReference><cbc:ID>${receipt.contractId}</cbc:ID></cac:ContractDocumentReference>`;
      extensionContent += `\n          </sbt:ExtDocuments>`;
    }

    const extensions = `
  <cec:UBLExtensions>
    <cec:UBLExtension>
      <cec:ExtensionContent>
        <sbt:SrbDtExt xmlns:sbt="${sbtNs}">${extensionContent}
        </sbt:SrbDtExt>
      </cec:ExtensionContent>
    </cec:UBLExtension>
  </cec:UBLExtensions>`;

    const lines = (receipt.lines || []).map(l => {
      const shortQty = l.shortQuantity ? `\n    <cbc:ShortQuantity unitCode="${l.unitCode}">${l.shortQuantity}</cbc:ShortQuantity>` : '';
      const rejectedQty = l.rejectedQuantity ? `\n    <cbc:RejectedQuantity unitCode="${l.unitCode}">${l.rejectedQuantity}</cbc:RejectedQuantity>` : '';
      const lineRef = l.despatchLineReference ? `\n    <cac:DespatchLineReference><cbc:LineID>${l.despatchLineReference.id}</cbc:LineID></cac:DespatchLineReference>` : '';
      const excise = l.exciseCategory ? `\n          <cac:ItemProperty><cbc:Name>AKCIZE.KATEGORIJA</cbc:Name><cbc:Value>${l.exciseCategory}</cbc:Value></cac:ItemProperty>` : '';
      const properties = l.itemProperties ? Object.entries(l.itemProperties).map(([name, value]) => `
          <cac:ItemProperty><cbc:Name>${name}</cbc:Name><cbc:Value>${value}</cbc:Value></cac:ItemProperty>`).join('') : '';

      return `
  <cac:ReceiptLine>
    <cbc:ID>${l.id}</cbc:ID>
    <cbc:ReceivedQuantity unitCode="${l.unitCode}">${l.receivedQuantity}</cbc:ReceivedQuantity>${shortQty}${rejectedQty}${lineRef}
    <cac:Item>
      <cbc:Name>${l.itemName}</cbc:Name>${excise}${properties}
    </cac:Item>
  </cac:ReceiptLine>`;
    }).join('');

    const despatchRef = receipt.despatchDocumentReference ? `
  <cac:DespatchDocumentReference>
    <cbc:ID>${receipt.despatchDocumentReference.id}</cbc:ID>
    <cbc:IssueDate>${receipt.despatchDocumentReference.issueDate || receipt.issueDate}</cbc:IssueDate>
  </cac:DespatchDocumentReference>` : '';

    return `<?xml version="1.0" encoding="utf-8"?>
<ubl:${root} xmlns:ubl="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:cec="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:sbt="http://mfin.gov.rs/srbdt/srbdtext">
  <!-- Lines: ${lineCount} -->
  ${extensions}
  <cbc:CustomizationID>urn:fdc:mfin.gov.rs:logistics:trns:receipt_advice:1:2025.12</cbc:CustomizationID>
  <cbc:ID>${receipt.id}</cbc:ID>
  <cbc:IssueDate>${receipt.issueDate}</cbc:IssueDate>
  ${despatchRef}
  ${lines}
</ubl:${root}>`;
  }

  static transformDespatch(advice: DespatchAdvice): string {
    const root = 'DespatchAdvice';
    const sbtNs = "http://mfin.gov.rs/srbdt/srbdtext";
    
    const lineCount = advice.lines?.length || 0;

    let extensionContent = `\n          <sbt:ShipmentMethod><cbc:ShipmentMethodType>${advice.shipmentMethod || '1'}</cbc:ShipmentMethodType></sbt:ShipmentMethod>`;
    
    if (advice.isReturn) extensionContent += `\n          <sbt:GoodsReturn><cbc:Return>1</cbc:Return></sbt:GoodsReturn>`;
    if (advice.offlineZinNumber) extensionContent += `\n          <sbt:OfflineZinNumber>${advice.offlineZinNumber}</sbt:OfflineZinNumber>`;
    
    const extensions = `
  <cec:UBLExtensions>
    <cec:UBLExtension>
      <cec:ExtensionContent>
        <sbt:SrbDtExt xmlns:sbt="${sbtNs}">${extensionContent}
        </sbt:SrbDtExt>
      </cec:ExtensionContent>
    </cec:UBLExtension>
  </cec:UBLExtensions>`;

    const despatchAddress = advice.despatchAddress ? `
  <cac:Delivery>
    <cac:DespatchAddress>
      <cbc:StreetName>${advice.despatchAddress.street}</cbc:StreetName>
      <cbc:CityName>${advice.despatchAddress.city}</cbc:CityName>
    </cac:DespatchAddress>
  </cac:Delivery>` : '';

    const notes = (advice.note || []).map(n => `\n  <cbc:Note>${n}</cbc:Note>`).join('');

    const lines = (advice.lines || []).map(l => {
      const deliveredQty = `<cbc:DeliveredQuantity unitCode="${l.unitCode}">${l.deliveredQuantity}</cbc:DeliveredQuantity>`;
      const excise = l.exciseCategory ? `\n          <cac:ItemProperty><cbc:Name>AKCIZE.KATEGORIJA</cbc:Name><cbc:Value>${l.exciseCategory}</cbc:Value></cac:ItemProperty>` : '';
      
      const properties = l.itemProperties ? Object.entries(l.itemProperties).map(([name, value]) => `
          <cac:ItemProperty><cbc:Name>${name}</cbc:Name><cbc:Value>${value}</cbc:Value></cac:ItemProperty>`).join('') : '';

      return `
  <cac:DespatchLine>
    <cbc:ID>${l.id}</cbc:ID>
    ${deliveredQty}
    <cac:Item>
      <cbc:Name>${l.name}</cbc:Name>${excise}${properties}
    </cac:Item>
  </cac:DespatchLine>`;
    }).join('');

    return `<?xml version="1.0" encoding="utf-8"?>
<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:cec="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:sbt="http://mfin.gov.rs/srbdt/srbdtext">
  <!-- Lines: ${lineCount} -->
  ${extensions}
  <cbc:CustomizationID>urn:fdc:mfin.gov.rs:logistics:trns:despatch_advice:1:2025.12</cbc:CustomizationID>
  <cbc:ID>${advice.id}</cbc:ID>
  <cbc:IssueDate>${advice.issueDate}</cbc:IssueDate>${notes}
  ${despatchAddress}
  ${lines}
</${root}>`;
  }

  static transformApplicationResponse(data: SefApplicationResponseInput): string {
    const sbtNs = "http://mfin.gov.rs/srbdt/srbdtext";
    
    const transShipment = data.responseCode === '5' ? `
          <sbt:TransShipment>
            <cbc:ID>${data.transportDetails?.licensePlate || 'N/A'}</cbc:ID>
            <sbt:NewCarrierName>${data.transportDetails?.newCarrierName || 'N/A'}</sbt:NewCarrierName>
          </sbt:TransShipment>` : '';

    const extensions = `
  <cec:UBLExtensions>
    <cec:UBLExtension>
      <cec:ExtensionContent>
        <sbt:SrbDtExt xmlns:sbt="${sbtNs}">${transShipment}
        </sbt:SrbDtExt>
      </cec:ExtensionContent>
    </cec:UBLExtension>
  </cec:UBLExtensions>`;

    return `<?xml version="1.0" encoding="utf-8"?>
<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2"
 xmlns:cec="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
 xmlns:sbt="http://mfin.gov.rs/srbdt/srbdtext">
  ${extensions}
  <cbc:ID>${data.id}</cbc:ID>
  <cbc:IssueDate>${data.issueDate}</cbc:IssueDate>
  <cac:DocumentResponse>
    <cac:Response>
      <cbc:ResponseCode>${data.responseCode}</cbc:ResponseCode>
    </cac:Response>
    <cac:DocumentReference>
      <cbc:ID>${data.referencedDocumentId}</cbc:ID>
    </cac:DocumentReference>
  </cac:DocumentResponse>
</ApplicationResponse>`;
  }
}
