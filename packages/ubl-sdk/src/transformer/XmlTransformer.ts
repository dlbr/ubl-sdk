import type { Invoice, Party, InvoiceLine } from '../models/Invoice.js';
import type { DespatchAdvice, DespatchLine } from '../models/DespatchAdvice.js';
import { TaxCalculator } from '../services/TaxCalculator.js';
import type { TaxGroup } from '../services/TaxCalculator.js';
import { PAYMENT_MEANS } from '../constants.js';

import type { ReceiptAdvice, ReceiptLine } from '../models/ReceiptAdvice.js';

/**
 * XmlTransformer - Sklapa "Iron Wall" UBL 2.1 XML za srpski SEF i eOtpremnice.
 */
export class XmlTransformer {
  static transformReceipt(receipt: ReceiptAdvice): string {
    const root = 'ReceiptAdvice';
    
    // 1. Extensions (SrbDtExt)
    const sbtNs = "http://mfin.gov.rs/srbdt/srbdtext";
    let extensionContent = '';
    
    if (receipt.shipmentMethod) {
      extensionContent += `\n          <sbt:ShipmentMethod><cbc:ShipmentMethodType>${receipt.shipmentMethod}</cbc:ShipmentMethodType></sbt:ShipmentMethod>`;
    }
    if (receipt.thirdPartyGoodsId) {
      extensionContent += `\n          <sbt:ThirdPartyGoods><cbc:ID>${receipt.thirdPartyGoodsId}</cbc:ID></sbt:ThirdPartyGoods>`;
    }
    if (receipt.isReturn) {
      extensionContent += `\n          <sbt:GoodsReturn><cbc:Return>1</cbc:Return></sbt:GoodsReturn>`;
    }
    if (receipt.offlineZinNumber) {
      extensionContent += `\n          <sbt:OfflineZinNumber>${receipt.offlineZinNumber}</sbt:OfflineZinNumber>`;
    }

    if (receipt.frameworkAgreementId || receipt.contractId) {
      extensionContent += `\n          <sbt:ExtDocuments>`;
      if (receipt.frameworkAgreementId) {
        extensionContent += `\n            <cac:OriginatorDocumentReference><cbc:ID>${receipt.frameworkAgreementId}</cbc:ID></cac:OriginatorDocumentReference>`;
      }
      if (receipt.contractId) {
        extensionContent += `\n            <cac:ContractDocumentReference><cbc:ID>${receipt.contractId}</cbc:ID></cac:ContractDocumentReference>`;
      }
      extensionContent += `\n          </sbt:ExtDocuments>`;
    }

    // v4.37.0: SrbDtExt is mandatory for MFIN
    if (!extensionContent) {
      extensionContent = `\n          <sbt:ShipmentMethod><cbc:ShipmentMethodType>${receipt.shipmentMethod || '1'}</cbc:ShipmentMethodType></sbt:ShipmentMethod>`;
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

    const id = `<cbc:ID>${receipt.id}</cbc:ID>`;
    const issueDate = `<cbc:IssueDate>${receipt.issueDate}</cbc:IssueDate>`;
    const now = new Date().toISOString();
    const iTime = receipt.issueTime || `${now.split('T')[1]?.split('.')[0] || '08:00:00'}+01:00`;
    const issueTimeTag = `\n  <cbc:IssueTime>${iTime}</cbc:IssueTime>`;
    
    const notes = (receipt.note || []).map(n => `\n  <cbc:Note>${n}</cbc:Note>`).join('');
    const customization = `<cbc:CustomizationID>urn:fdc:mfin.gov.rs:logistics:trns:receipt_advice:1:2025.12</cbc:CustomizationID>`;
    const profile = `<cbc:ProfileID>urn:fdc:peppol.eu:logistics:bis:despatch_advice_w_receipt_advice:1</cbc:ProfileID>`;
    const typeCode = `<cbc:ReceiptAdviceTypeCode>Ext</cbc:ReceiptAdviceTypeCode>`;

    const despatchRef = receipt.despatchDocumentReference ? `
  <cac:DespatchDocumentReference>
    <cbc:ID>${receipt.despatchDocumentReference.id}</cbc:ID>
    <cbc:IssueDate>${receipt.despatchDocumentReference.issueDate || receipt.issueDate}</cbc:IssueDate>
    <cac:IssuerParty>
      <cbc:EndpointID schemeID="9948">${receipt.seller.pib}</cbc:EndpointID>
      ${receipt.seller.jbkjs ? `<cac:PartyIdentification><cbc:ID>JBKJS:${receipt.seller.jbkjs}</cbc:ID></cac:PartyIdentification>` : ''}
      <cac:PartyName><cbc:Name>${receipt.seller.name}</cbc:Name></cac:PartyName>
    </cac:IssuerParty>
  </cac:DespatchDocumentReference>` : '';

    const orderRef = receipt.orderReference ? `
  <cac:OrderReference>
    <cbc:ID>${receipt.orderReference.id}</cbc:ID>
    ${receipt.orderReference.issueDate ? `<cbc:IssueDate>${receipt.orderReference.issueDate}</cbc:IssueDate>` : ''}
  </cac:OrderReference>` : '';

    const seller = this.generateParty('DespatchSupplierParty', receipt.seller);
    const buyer = this.generateParty('DeliveryCustomerParty', receipt.buyer);
    
    const shipment = `
  <cac:Shipment>
    <cbc:ID>${receipt.id}-SHIP</cbc:ID>
    <cac:ShipmentStage>
      <cbc:ID>1</cbc:ID>
      <cac:CarrierParty>
        <cbc:EndpointID schemeID="9948">${receipt.carrier?.pib || receipt.seller.pib}</cbc:EndpointID>
        <cac:PartyName><cbc:Name>${receipt.carrier?.name || receipt.seller.name}</cbc:Name></cac:PartyName>
        <cac:PostalAddress>
          <cbc:StreetName>${receipt.carrier?.address || receipt.seller.address || 'Ulica'}</cbc:StreetName>
          <cbc:CityName>${receipt.carrier?.city || receipt.seller.city || 'Grad'}</cbc:CityName>
          <cbc:PostalZone>${receipt.carrier?.zip || receipt.seller.zip || '11000'}</cbc:PostalZone>
          <cac:Country><cbc:IdentificationCode>RS</cbc:IdentificationCode></cac:Country>
        </cac:PostalAddress>
        <cac:PartyTaxScheme><cbc:CompanyID>RS${receipt.carrier?.pib || receipt.seller.pib}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
        <cac:PartyLegalEntity>
          <cbc:RegistrationName>${receipt.carrier?.name || receipt.seller.name}</cbc:RegistrationName>
          <cbc:CompanyID>${receipt.carrier?.maticniBroj || receipt.seller.maticniBroj || '00000000'}</cbc:CompanyID>
        </cac:PartyLegalEntity>
      </cac:CarrierParty>
      <cac:TransportMeans>
        <cac:RoadTransport>
          <cbc:LicensePlateID>BG-000-XX</cbc:LicensePlateID>
        </cac:RoadTransport>
      </cac:TransportMeans>
    </cac:ShipmentStage>
    <cac:Delivery>
      <cbc:ActualDeliveryDate>${receipt.issueDate}</cbc:ActualDeliveryDate>
      <cbc:ActualDeliveryTime>${iTime}</cbc:ActualDeliveryTime>
    </cac:Delivery>
  </cac:Shipment>`;

    const lines = receipt.lines.map((l, i) => {
      const shortQty = `<cbc:ShortQuantity unitCode="${l.unitCode}">${l.shortQuantity || 0}</cbc:ShortQuantity>`;
      const rejectedQty = `<cbc:RejectedQuantity unitCode="${l.unitCode}">${l.rejectedQuantity || 0}</cbc:RejectedQuantity>`;
      const rejectReason = l.rejectReason ? `\n    <cbc:RejectReason>${l.rejectReason}</cbc:RejectReason>` : '';
      const despatchLineRef = l.despatchLineReference ? `\n    <cac:DespatchLineReference><cbc:LineID>${l.despatchLineReference.id}</cbc:LineID></cac:DespatchLineReference>` : '';

      let props = '';
      if (l.exciseCategory) {
        props += `\n      <cac:AdditionalItemProperty><cbc:Name>AKCIZE.KATEGORIJA</cbc:Name><cbc:Value>${l.exciseCategory}</cbc:Value></cac:AdditionalItemProperty>`;
      }
      if (l.itemProperties) {
        for (const [name, val] of Object.entries(l.itemProperties)) {
          props += `\n      <cac:AdditionalItemProperty><cbc:Name>${name}</cbc:Name><cbc:Value>${val}</cbc:Value></cac:AdditionalItemProperty>`;
        }
      }

      return `
  <cac:ReceiptLine>
    <cbc:ID>${l.id || (i + 1)}</cbc:ID>
    <cbc:ReceivedQuantity unitCode="${l.unitCode}">${l.receivedQuantity}</cbc:ReceivedQuantity>
    ${shortQty}
    ${rejectedQty}${rejectReason}${despatchLineRef}
    <cac:Item>
      <cbc:Name>${l.itemName}</cbc:Name>
      <cac:SellersItemIdentification><cbc:ID>${l.itemIdentification || l.id || (i + 1)}</cbc:ID></cac:SellersItemIdentification>${props}
    </cac:Item>
  </cac:ReceiptLine>`;
    }).join('');

    return `<?xml version="1.0" encoding="utf-8"?>
<ubl:${root} xmlns:ubl="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:cec="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:sbt="http://mfin.gov.rs/srbdt/srbdtext">
  ${extensions}
  ${customization}
  ${profile}
  ${id}
  ${issueDate}${issueTimeTag}
  ${typeCode}
  ${notes}
  ${orderRef}
  ${despatchRef}
  ${buyer}
  ${seller}
  ${shipment}
  ${lines}
</ubl:${root}>`.trim();
  }

  static transformDespatch(advice: DespatchAdvice): string {
    const root = 'DespatchAdvice';
    
    // 1. Extensions (SrbDtExt)
    const sbtNs = "http://mfin.gov.rs/srbdt/srbdtext";
    let extensionContent = '';
    
    if (advice.shipmentMethod) {
      extensionContent += `\n          <sbt:ShipmentMethod><cbc:ShipmentMethodType>${advice.shipmentMethod}</cbc:ShipmentMethodType></sbt:ShipmentMethod>`;
    }
    if (advice.thirdPartyGoodsId) {
      extensionContent += `\n          <sbt:ThirdPartyGoods><cbc:ID>${advice.thirdPartyGoodsId}</cbc:ID></sbt:ThirdPartyGoods>`;
    }
    if (advice.isReturn) {
      extensionContent += `\n          <sbt:GoodsReturn><cbc:Return>1</cbc:Return></sbt:GoodsReturn>`;
    }
    if (advice.offlineZinNumber) {
      extensionContent += `\n          <sbt:OfflineZinNumber>${advice.offlineZinNumber}</sbt:OfflineZinNumber>`;
    }

    // v4.37.0: SrbDtExt is mandatory for MFIN
    if (!extensionContent) {
      extensionContent = `\n          <sbt:ShipmentMethod><cbc:ShipmentMethodType>${advice.shipmentMethod || '1'}</cbc:ShipmentMethodType></sbt:ShipmentMethod>`;
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

    const id = `<cbc:ID>${advice.id}</cbc:ID>`;
    const issueDate = `<cbc:IssueDate>${advice.issueDate}</cbc:IssueDate>`;
    const now = new Date().toISOString();
    const issueTime = advice.issueTime ? `\n  <cbc:IssueTime>${advice.issueTime}</cbc:IssueTime>` : `\n  <cbc:IssueTime>${now.split('T')[1]?.split('.')[0] || '08:00:00'}+01:00</cbc:IssueTime>`;
    
    const notes = (advice.note || []).map(n => `\n  <cbc:Note>${n}</cbc:Note>`).join('');
    const customization = `<cbc:CustomizationID>urn:fdc:mfin.gov.rs:logistics:trns:despatch_advice:1:2025.12</cbc:CustomizationID>`;
    const profile = `<cbc:ProfileID>urn:fdc:peppol.eu:logistics:bis:despatch_advice_only:1</cbc:ProfileID>`;
    const typeCode = `<cbc:DespatchAdviceTypeCode>Ext</cbc:DespatchAdviceTypeCode>`;

    const orderRef = advice.orderReference ? `
  <cac:OrderReference>
    <cbc:ID>${advice.orderReference.id}</cbc:ID>
    ${advice.orderReference.issueDate ? `<cbc:IssueDate>${advice.orderReference.issueDate}</cbc:IssueDate>` : ''}
  </cac:OrderReference>` : '';

    const seller = this.generateParty('DespatchSupplierParty', advice.seller);
    const buyer = this.generateParty('DeliveryCustomerParty', advice.buyer);
    
    const iTime = advice.issueTime || `${now.split('T')[1]?.split('.')[0] || '08:00:00'}+01:00`;

    const delivery = `
  <cac:Shipment>
    <cbc:ID>${advice.id}-SHIP</cbc:ID>
    <cac:ShipmentStage>
      <cbc:ID>1</cbc:ID>
      <cac:CarrierParty>
        <cbc:EndpointID schemeID="9948">${advice.carrier?.pib || advice.seller.pib}</cbc:EndpointID>
        <cac:PartyName><cbc:Name>${advice.carrier?.name || advice.seller.name}</cbc:Name></cac:PartyName>
        <cac:PostalAddress>
          <cbc:StreetName>${advice.carrier?.address || advice.seller.address || 'Ulica'}</cbc:StreetName>
          <cbc:CityName>${advice.carrier?.city || advice.seller.city || 'Grad'}</cbc:CityName>
          <cbc:PostalZone>${advice.carrier?.zip || advice.seller.zip || '11000'}</cbc:PostalZone>
          <cac:Country><cbc:IdentificationCode>RS</cbc:IdentificationCode></cac:Country>
        </cac:PostalAddress>
        <cac:PartyTaxScheme><cbc:CompanyID>RS${advice.carrier?.pib || advice.seller.pib}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
        <cac:PartyLegalEntity>
          <cbc:RegistrationName>${advice.carrier?.name || advice.seller.name}</cbc:RegistrationName>
          <cbc:CompanyID>${advice.carrier?.maticniBroj || advice.seller.maticniBroj || '00000000'}</cbc:CompanyID>
        </cac:PartyLegalEntity>
      </cac:CarrierParty>
      <cac:TransportMeans>
        <cac:RoadTransport>
          <cbc:LicensePlateID>BG-000-XX</cbc:LicensePlateID>
        </cac:RoadTransport>
      </cac:TransportMeans>
    </cac:ShipmentStage>
    <cac:Delivery>
      <cac:DeliveryAddress>
        <cbc:StreetName>${advice.deliveryAddress?.street || advice.buyer.address || 'Ulica 2'}</cbc:StreetName>
        <cbc:CityName>${advice.deliveryAddress?.city || advice.buyer.city || 'Grad'}</cbc:CityName>
        <cbc:PostalZone>${advice.deliveryAddress?.zip || advice.buyer.zip || '11000'}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${advice.deliveryAddress?.countryCode || 'RS'}</cbc:IdentificationCode></cac:Country>
      </cac:DeliveryAddress>
      <cac:EstimatedDeliveryPeriod>
        <cbc:EndDate>${advice.issueDate}</cbc:EndDate>
        <cbc:EndTime>23:59:59+01:00</cbc:EndTime>
      </cac:EstimatedDeliveryPeriod>
      <cac:Despatch>
        <cbc:ActualDespatchDate>${advice.issueDate}</cbc:ActualDespatchDate>
        <cbc:ActualDespatchTime>${iTime}</cbc:ActualDespatchTime>
        <cac:DespatchAddress>
          <cbc:StreetName>${advice.despatchAddress?.street || advice.seller.address || 'Ulica 1'}</cbc:StreetName>
          <cbc:CityName>${advice.despatchAddress?.city || advice.seller.city || 'Grad'}</cbc:CityName>
          <cbc:PostalZone>${advice.despatchAddress?.zip || advice.seller.zip || '11000'}</cbc:PostalZone>
          <cac:Country><cbc:IdentificationCode>${advice.despatchAddress?.countryCode || 'RS'}</cbc:IdentificationCode></cac:Country>
        </cac:DespatchAddress>
      </cac:Despatch>
    </cac:Delivery>
  </cac:Shipment>`;

    const lines = advice.lines.map((l, i) => {
      let props = '';
      if (l.exciseCategory) {
        props += `\n      <cac:AdditionalItemProperty><cbc:Name>AKCIZE.KATEGORIJA</cbc:Name><cbc:Value>${l.exciseCategory}</cbc:Value></cac:AdditionalItemProperty>`;
      }
      if (l.itemProperties) {
        for (const [name, val] of Object.entries(l.itemProperties)) {
          props += `\n      <cac:AdditionalItemProperty><cbc:Name>${name}</cbc:Name><cbc:Value>${val}</cbc:Value></cac:AdditionalItemProperty>`;
        }
      }

      return `
  <cac:DespatchLine>
    <cbc:ID>${l.id || (i + 1)}</cbc:ID>
    <cbc:DeliveredQuantity unitCode="${l.unitCode || 'H87'}">${l.deliveredQuantity}</cbc:DeliveredQuantity>
    <cac:Item>
      <cbc:Name>${l.name}</cbc:Name>
      <cac:SellersItemIdentification><cbc:ID>${l.itemID || l.id || (i + 1)}</cbc:ID></cac:SellersItemIdentification>${props}
    </cac:Item>
  </cac:DespatchLine>`;
    }).join('');

    return `<?xml version="1.0" encoding="utf-8"?>
<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:cec="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:sbt="http://mfin.gov.rs/srbdt/srbdtext">
  ${extensions}
  ${customization}
  ${profile}
  ${id}
  ${issueDate}${issueTime}
  ${typeCode}
  ${notes}
  ${orderRef}
  ${seller}
  ${buyer}
  ${delivery}
  ${lines}
</${root}>`.trim();
  }

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
        <cbc:Percent>${['S', 'R'].includes(l.taxCategory) ? l.taxRate.toFixed(2) : '0.00'}</cbc:Percent>
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
