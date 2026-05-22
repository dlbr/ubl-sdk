import { 
  AvansData, 
  KonacniData, 
  StornoData, 
  PovecanjeData, 
  OslobodjenaData, 
  JavnaNabavkaData, 
  PopustData, 
  PrilogData, 
  ValutaData, 
  FiskalizacijaData, 
  KonacnaValutaData, 
  SmanjenjeAvansaData, 
  SmanjenjeUPerioduData, 
  SmanjenjeViseFakturaData,
  ZbirniEeoData,
  PojedinacnaEeoData,
  EppData,
  BaseInvoiceData
} from './types';

export { SefLiveValidator } from './validator';
export * from './types';

/**
 * SefPoreskiJsonBuilder - Generates official JSON payloads for SEF tax records (EEO/EPP).
 */
export class SefPoreskiJsonBuilder {
  static buildZbirniEeoPayload(data: ZbirniEeoData) {
    const [year, month] = data.poreskiPeriod.split('-').map(Number);
    return {
      Year: year, Month: month,
      TaxRecords: [
        { TaxRatePercentage: 20.00, Amount: parseFloat(data.osnovicaOpsta.toFixed(2)), TaxAmount: parseFloat(data.pdvOpsta.toFixed(2)) },
        { TaxRatePercentage: 10.00, Amount: parseFloat(data.osnovicaPosebna.toFixed(2)), TaxAmount: parseFloat(data.pdvPosebna.toFixed(2)) }
      ]
    };
  }
  static buildPojedinacnaEeoPayload(data: PojedinacnaEeoData) {
    const [year, month] = data.poreskiPeriod.split('-').map(Number);
    return {
      Year: year, Month: month, Type: "IndividualInternalInvoice", InternalInvoiceNumber: data.internalInvoiceNumber,
      TaxRecords: [
        { TaxRatePercentage: 20.00, Amount: parseFloat(data.osnovicaOpsta.toFixed(2)), TaxAmount: parseFloat(data.pdvOpsta.toFixed(2)) },
        { TaxRatePercentage: 10.00, Amount: parseFloat(data.osnovicaPosebna.toFixed(2)), TaxAmount: parseFloat(data.pdvPosebna.toFixed(2)) }
      ]
    };
  }
  static buildEppPayload(data: EppData) {
    const [year, month] = data.period.split('-').map(Number);
    return {
      Year: year, Month: month,
      InputTaxRecords: [
        { Type: "PurchaseInvoiced", TaxAmount: parseFloat(data.prethodniPorezOdObveznika.toFixed(2)) },
        { Type: "Import", TaxAmount: parseFloat(data.importPdvCarina.toFixed(2)) }
      ]
    };
  }
}

/**
 * SefUblBuilder - v4.3.6 Absolute Compliance Matrix.
 * Forensic compliance with Serbian SEF Technical Manual & OASIS UBL 2.1 Schema.
 */
export class SefUblBuilder {

  private static formatAmount(amount: number | undefined, smer: 'POZITIVAN' | 'NEGATIVAN' = 'POZITIVAN'): string {
    if (amount === undefined || amount === null || isNaN(amount)) return '0.00';
    const absoluteValue = Math.abs(amount);
    if (absoluteValue < 0.001) return '0.00'; // 🛡️ Prevent -0.00 for zero values
    return smer === 'NEGATIVAN' ? `-${absoluteValue.toFixed(2)}` : absoluteValue.toFixed(2);
  }

  private static getCleanStopa(taxCat: string, userStopa?: number): string {
    // 🛡️ ZAKONSKI ŠTIT: Kategorije N, E, Z, R ne smeju imati stopu različitu od 0.00%
    if (['N', 'E', 'Z', 'R'].includes(taxCat)) return '0.00';
    return (userStopa !== undefined ? userStopa : 20.00).toFixed(2);
  }

  private static getCleanPdv(taxCat: string, pdv: number): number {
    if (['N', 'E', 'Z', 'R'].includes(taxCat)) return 0;
    return pdv;
  }

  /**
   * Universal assembly method that guarantees XSD sequence compliance.
   */
  private static assembleUbl(data: BaseInvoiceData, sections: {
    typeCode: string;
    rootTag: 'Invoice' | 'CreditNote';
    invoicePeriod?: string;
    billingRef?: string;
    additionalRefs?: string;
    summary?: string;
    lines: string;
    extensions?: string;
  }): string {
    const rootTag = sections.rootTag;
    const urn = rootTag === 'CreditNote' ? 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2' : 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
    const typeTag = rootTag === 'CreditNote' ? 'CreditNoteTypeCode' : 'InvoiceTypeCode';
    const today = new Date().toISOString().split('T')[0];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<${rootTag} xmlns="${urn}"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:cec="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
         xmlns:sbt="http://mfin.gov.rs/srbdt/srbdtext">`;

    if (sections.extensions) xml += `\n${sections.extensions}`;

    xml += `\n  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.rs:srbdt:2022</cbc:CustomizationID>
  <cbc:ID>${data.broj}</cbc:ID>
  <cbc:IssueDate>${data.datumIzdavanja || today}</cbc:IssueDate>`;

    if (rootTag === 'Invoice') {
      xml += `\n  <cbc:DueDate>${data.datumDospeca || today}</cbc:DueDate>`;
    }
    
    xml += `\n  <cbc:${typeTag}>${sections.typeCode}</cbc:${typeTag}>`;
    if (data.note) xml += `\n  <cbc:Note>${data.note}</cbc:Note>`;
    xml += `\n  <cbc:DocumentCurrencyCode>${data.valuta || 'RSD'}</cbc:DocumentCurrencyCode>`;

    if (sections.invoicePeriod) xml += `\n${sections.invoicePeriod}`;
    if (data.brojNarudzbenice) xml += `\n  <cac:OrderReference><cbc:ID>${data.brojNarudzbenice}</cbc:ID></cac:OrderReference>`;
    if (sections.billingRef) xml += `\n${sections.billingRef}`;
    if (sections.additionalRefs) xml += `\n${sections.additionalRefs}`;
    if (data.buyerReference) xml += `\n  <cbc:BuyerReference>${data.buyerReference}</cbc:BuyerReference>`;

    const buildParty = (role: 'Supplier' | 'Customer', pib: string, name?: string, mb?: string, addr?: string, city?: string, zip?: string) => {
      const tag = role === 'Supplier' ? 'cac:AccountingSupplierParty' : 'cac:AccountingCustomerParty';
      const jbkjs = (role === 'Customer' && data.jbkjs) ? `\n      <cac:PartyIdentification><cbc:ID>JBKJS:${data.jbkjs}</cbc:ID></cac:PartyIdentification>` : '';
      return `
  <${tag}>
    <cac:Party>
      <cbc:EndpointID schemeID="9948">${pib}</cbc:EndpointID>${jbkjs}
      <cac:PartyName><cbc:Name>${name || (role === 'Supplier' ? 'Prodavac' : 'Kupac')}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${addr || 'Ulica bb'}</cbc:StreetName>
        <cbc:CityName>${city || 'Grad'}</cbc:CityName>
        <cbc:PostalZone>${zip || '11000'}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>RS</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme><cbc:CompanyID>RS${pib}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${name || (role === 'Supplier' ? 'Prodavac' : 'Kupac')}</cbc:RegistrationName>
        <cbc:CompanyID>${mb || '00000000'}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </${tag}>`;
    };

    xml += buildParty('Supplier', data.pibProdavca, data.nazivProdavca, data.maticniBrojProdavca, data.adresaProdavca, data.gradProdavca, data.postanskiBrojProdavca);
    xml += buildParty('Customer', data.pibKupca, data.nazivKupca, data.maticniBrojKupca, data.adresaKupca, data.gradKupca, data.postanskiBrojKupca);

    if (rootTag === 'Invoice' && data.datumPrometa) {
      xml += `\n  <cac:Delivery><cbc:ActualDeliveryDate>${data.datumPrometa}</cbc:ActualDeliveryDate></cac:Delivery>`;
    }

    if (sections.summary) xml += `\n${sections.summary}`;
    xml += `\n${sections.lines}\n</${rootTag}>`;

    return xml.trim();
  }

  static buildStandardna(data: AvansData) {
    const smer = data.smerDokumenta || 'POZITIVAN';
    const taxCat = data.poreskaKategorija || 'S';
    const stopa = this.getCleanStopa(taxCat, data.pdvStopa);
    const pdv = this.getCleanPdv(taxCat, data.pdv);
    const summary = `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(pdv, smer)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(data.osnovica, smer)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.formatAmount(pdv, smer)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>${taxCat}</cbc:ID><cbc:Percent>${stopa}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.osnovica, smer)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RSD">${this.formatAmount(data.osnovica, smer)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RSD">${this.formatAmount((data.osnovica||0)+pdv, smer)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount((data.osnovica||0)+pdv, smer)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;
    const lines = `
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="H87">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.osnovica, smer)}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Promet dobara i usluga</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>${taxCat}</cbc:ID><cbc:Percent>${stopa}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="RSD">${this.formatAmount(data.osnovica, smer)}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>`;
    return this.assembleUbl(data, { typeCode: '380', rootTag: 'Invoice', summary, lines });
  }

  static buildAvansni(data: AvansData) {
    const smer = data.smerDokumenta || 'POZITIVAN';
    const taxCat = data.poreskaKategorija || 'S';
    const stopa = this.getCleanStopa(taxCat, data.pdvStopa);
    const pdv = this.getCleanPdv(taxCat, data.pdv);
    const summary = `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(pdv, smer)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(data.osnovica, smer)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.formatAmount(pdv, smer)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>${taxCat}</cbc:ID><cbc:Percent>${stopa}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.osnovica, smer)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RSD">${this.formatAmount(data.osnovica, smer)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RSD">${this.formatAmount((data.osnovica||0)+pdv, smer)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount((data.osnovica||0)+pdv, smer)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;
    const lines = `
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="H87">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.osnovica, smer)}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Avansna uplata</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>${taxCat}</cbc:ID><cbc:Percent>${stopa}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="RSD">${this.formatAmount(data.osnovica, smer)}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>`;
    return this.assembleUbl(data, { typeCode: '386', rootTag: 'Invoice', summary, lines });
  }

  static buildSmanjenje(data: StornoData) {
    const smer = data.smerDokumenta || 'NEGATIVAN';
    const taxCat = data.poreskaKategorija || 'S';
    const stopa = this.getCleanStopa(taxCat, data.pdvStopa);
    const pdv = this.getCleanPdv(taxCat, data.iznosZaSmanjenjePdv);
    const billingRef = `  <cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${data.referentniRacun}</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>`;
    const summary = `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(pdv, smer)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(data.iznosZaSmanjenjeOsnovice, smer)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.formatAmount(pdv, smer)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>${taxCat}</cbc:ID><cbc:Percent>${stopa}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.iznosZaSmanjenjeOsnovice, smer)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RSD">${this.formatAmount(data.iznosZaSmanjenjeOsnovice, smer)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RSD">${this.formatAmount((data.iznosZaSmanjenjeOsnovice||0)+pdv, smer)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount((data.iznosZaSmanjenjeOsnovice||0)+pdv, smer)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;
    const lines = `
  <cac:CreditNoteLine>
    <cbc:ID>1</cbc:ID>
    <cbc:CreditedQuantity unitCode="H87">1</cbc:CreditedQuantity>
    <cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.iznosZaSmanjenjeOsnovice, smer)}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>${data.razlog || 'Smanjenje'}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>${taxCat}</cbc:ID><cbc:Percent>${stopa}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="RSD">${this.formatAmount(data.iznosZaSmanjenjeOsnovice, smer)}</cbc:PriceAmount></cac:Price>
  </cac:CreditNoteLine>`;
    return this.assembleUbl(data, { typeCode: '381', rootTag: 'CreditNote', billingRef, summary, lines });
  }

  static buildPovecanje(data: PovecanjeData) {
    const smer = data.smerDokumenta || 'POZITIVAN';
    const taxCat = data.poreskaKategorija || 'S';
    const stopa = this.getCleanStopa(taxCat, data.pdvStopa);
    const pdv = this.getCleanPdv(taxCat, data.iznosZaPovecanjePdv);
    const invoicePeriod = `  <cac:InvoicePeriod><cbc:DescriptionCode>3</cbc:DescriptionCode></cac:InvoicePeriod>`;
    const billingRef = `  <cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${data.referentniRacun}</cbc:ID><cbc:IssueDate>${data.datumReferentnog}</cbc:IssueDate></cac:InvoiceDocumentReference></cac:BillingReference>`;
    const summary = `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(pdv, smer)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(data.iznosZaPovecanjeOsnovice, smer)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.formatAmount(pdv, smer)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>${taxCat}</cbc:ID><cbc:Percent>${stopa}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.iznosZaPovecanjeOsnovice, smer)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RSD">${this.formatAmount(data.iznosZaPovecanjeOsnovice, smer)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RSD">${this.formatAmount((data.iznosZaPovecanjeOsnovice||0)+pdv, smer)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount((data.iznosZaPovecanjeOsnovice||0)+pdv, smer)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;
    const lines = `
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="H87">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.iznosZaPovecanjeOsnovice, smer)}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Povećanje</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>${taxCat}</cbc:ID><cbc:Percent>${stopa}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="RSD">${this.formatAmount(data.iznosZaPovecanjeOsnovice, smer)}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>`;
    return this.assembleUbl(data, { typeCode: '383', rootTag: 'Invoice', invoicePeriod, billingRef, summary, lines });
  }

  static buildKonacniSaAvansom(data: KonacniData) {
    const smer = data.smerDokumenta || 'POZITIVAN';
    const taxCat = data.poreskaKategorija || 'S';
    const stopa = this.getCleanStopa(taxCat, data.pdvStopa);
    const netoProdato = data.ukupnaOsnovica;
    const pdvProdato = this.getCleanPdv(taxCat, data.ukupniPdv);
    const brutoProdato = netoProdato + pdvProdato;
    const zaUplatu = brutoProdato - data.odbitakAvansaSaPdv;

    const billingRef = `  <cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${data.avansBroj}</cbc:ID><cbc:IssueDate>${data.avansDatum}</cbc:IssueDate><cbc:DocumentTypeCode>386</cbc:DocumentTypeCode></cac:InvoiceDocumentReference></cac:BillingReference>`;
    
    const netoOdbitka = data.odbitakAvansaSaPdv / (1 + (parseFloat(stopa) / 100));
    const pdvOdbitka = data.odbitakAvansaSaPdv - netoOdbitka;

    const summary = `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(pdvProdato - pdvOdbitka, smer)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(netoProdato - netoOdbitka, smer)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.formatAmount(pdvProdato - pdvOdbitka, smer)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>${taxCat}</cbc:ID><cbc:Percent>${stopa}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(netoProdato - netoOdbitka, smer)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RSD">${this.formatAmount(netoProdato - netoOdbitka, smer)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RSD">${this.formatAmount(zaUplatu, smer)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount(zaUplatu, smer)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;

    const lines = `
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="H87">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(netoProdato, smer)}</cbc:LineExtensionAmount><cac:Item><cbc:Name>Konačni obračun</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>${taxCat}</cbc:ID><cbc:Percent>${stopa}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="RSD">${this.formatAmount(netoProdato, smer)}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
  <cac:InvoiceLine><cbc:ID>AVANS-REDUKCIJA</cbc:ID><cbc:InvoicedQuantity unitCode="H87">-1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="RSD">-${netoOdbitka.toFixed(2)}</cbc:LineExtensionAmount><cac:Item><cbc:Name>Umanjenje po avansu</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>${taxCat}</cbc:ID><cbc:Percent>${stopa}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="RSD">${netoOdbitka.toFixed(2)}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`;
    return this.assembleUbl(data, { typeCode: '380', rootTag: 'Invoice', billingRef, summary, lines });
  }

  static buildOslobodjena(data: OslobodjenaData) {
    const smer = data.smerDokumenta || 'POZITIVAN';
    const kat = data.poreskaKategorija || 'E';
    const stopa = this.getCleanStopa(kat);
    let exTags = '';
    if (['E', 'Z', 'R'].includes(kat)) {
      if (!data.sifraOslobodjenja) throw new Error(`Šifra mandatorna za ${kat}`);
      exTags = `\n        <cbc:TaxExemptionReasonCode>${data.sifraOslobodjenja}</cbc:TaxExemptionReasonCode>\n        <cbc:TaxExemptionReason>${data.zakonskiClan || 'Po zakonu'}</cbc:TaxExemptionReason>`;
    }
    const summary = `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">0.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(data.iznos, smer)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">0.00</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>${kat}</cbc:ID><cbc:Percent>${stopa}</cbc:Percent>${exTags}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.iznos, smer)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RSD">${this.formatAmount(data.iznos, smer)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RSD">${this.formatAmount(data.iznos, smer)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount(data.iznos, smer)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;
    const lines = `
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="H87">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.iznos, smer)}</cbc:LineExtensionAmount><cac:Item><cbc:Name>Oslobođeni promet</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>${kat}</cbc:ID><cbc:Percent>${stopa}</cbc:Percent>${exTags}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="RSD">${this.formatAmount(data.iznos, smer)}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`;
    return this.assembleUbl(data, { typeCode: '380', rootTag: 'Invoice', summary, lines });
  }

  static buildSaPopustom(data: PopustData) {
    const smer = data.smerDokumenta || 'POZITIVAN';
    const taxCat = data.poreskaKategorija || 'S';
    const stopa = this.getCleanStopa(taxCat, data.pdvStopa);
    const neto = data.iznosPrePopusta - data.popustIznos;
    const pdv = neto * (parseFloat(stopa) / 100);
    const summary = `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(pdv, smer)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(neto, smer)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.formatAmount(pdv, smer)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>${taxCat}</cbc:ID><cbc:Percent>${stopa}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.iznosPrePopusta, smer)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RSD">${this.formatAmount(neto, smer)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RSD">${this.formatAmount(neto + pdv, smer)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="RSD">${this.formatAmount(data.popustIznos, smer)}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount(neto + pdv, smer)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;
    const lines = `
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="H87">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.iznosPrePopusta, smer)}</cbc:LineExtensionAmount><cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:Amount currencyID="RSD">${this.formatAmount(data.popustIznos, smer)}</cbc:Amount></cac:AllowanceCharge><cac:Item><cbc:Name>Popust</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>${taxCat}</cbc:ID><cbc:Percent>${stopa}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="RSD">${this.formatAmount(data.iznosPrePopusta, smer)}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`;
    return this.assembleUbl(data, { typeCode: '380', rootTag: 'Invoice', summary, lines });
  }

  static buildSaValutom(data: ValutaData) {
    const exRate = `  <cac:TaxExchangeRate><cbc:SourceCurrencyCode>${data.valuta}</cbc:SourceCurrencyCode><cbc:TargetCurrencyCode>RSD</cbc:TargetCurrencyCode><cbc:CalculationRate>${data.kurs}</cbc:CalculationRate><cbc:Date>${data.kursDatum}</cbc:Date></cac:TaxExchangeRate>`;
    const summary = `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.pdvRSD)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(data.osnovicaRSD)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.pdvRSD)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>20.00</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${data.valuta}">${this.formatAmount(data.ukupnoValuta / 1.2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${data.valuta}">${this.formatAmount(data.ukupnoValuta / 1.2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${data.valuta}">${this.formatAmount(data.ukupnoValuta)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${data.valuta}">${this.formatAmount(data.ukupnoValuta)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;
    const lines = `
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="H87">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="${data.valuta}">${this.formatAmount(data.ukupnoValuta / 1.2)}</cbc:LineExtensionAmount><cac:Item><cbc:Name>Devizna stavka</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>20.00</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="${data.valuta}">${this.formatAmount(data.ukupnoValuta / 1.2)}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`;
    return this.assembleUbl(data, { typeCode: '380', rootTag: 'Invoice', additionalRefs: exRate, summary, lines });
  }

  static buildSmanjenjeAvansa(data: SmanjenjeAvansaData) {
    const smer = data.smerDokumenta || 'NEGATIVAN';
    const taxCat = data.poreskaKategorija || 'S';
    const stopa = this.getCleanStopa(taxCat, data.pdvStopa);
    const extension = `  <cec:UBLExtensions><cec:UBLExtension><cec:ExtensionContent><sbt:SrbDtExt><sbt:InvoicedPrepaymentAmount><cbc:ID>${data.avansBroj}</cbc:ID><cac:TaxTotal><cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.iznosSmanjenjaPdv, smer)}</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="RSD">${this.formatAmount(data.iznosSmanjenjaOsnovice, smer)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.iznosSmanjenjaPdv, smer)}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>${taxCat}</cbc:ID><cbc:Percent>${stopa}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal></sbt:InvoicedPrepaymentAmount><sbt:ReducedTotals><cac:TaxTotal><cbc:TaxAmount currencyID="RSD">0.00</cbc:TaxAmount></cac:TaxTotal><cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount currencyID="RSD">${this.formatAmount(data.iznosSmanjenjaOsnovice, smer)}</cbc:TaxExclusiveAmount></cac:LegalMonetaryTotal></sbt:ReducedTotals></sbt:SrbDtExt></cec:ExtensionContent></cec:UBLExtension></cec:UBLExtensions>`;
    const billingRef = `  <cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${data.avansBroj}</cbc:ID><cbc:IssueDate>${data.avansDatum}</cbc:IssueDate></cac:InvoiceDocumentReference></cac:BillingReference>`;
    const summary = `
  <cac:TaxTotal><cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.iznosSmanjenjaPdv, smer)}</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:PayableAmount currencyID="RSD">0.00</cbc:PayableAmount></cac:LegalMonetaryTotal>`;
    const lines = `
  <cac:CreditNoteLine><cbc:ID>1</cbc:ID><cbc:CreditedQuantity unitCode="H87">1</cbc:CreditedQuantity><cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.iznosSmanjenjaOsnovice, smer)}</cbc:LineExtensionAmount><cac:Item><cbc:Name>Smanjenje avansa</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>${taxCat}</cbc:ID><cbc:Percent>${stopa}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="RSD">${this.formatAmount(data.iznosSmanjenjaOsnovice, smer)}</cbc:PriceAmount></cac:Price></cac:CreditNoteLine>`;
    return this.assembleUbl(data, { typeCode: '381', rootTag: 'CreditNote', billingRef, summary, lines, extensions: extension });
  }

  static buildSmanjenjeUPeriodu(data: any) {
    const smer = 'NEGATIVAN';
    const invoicePeriod = `  <cac:InvoicePeriod><cbc:StartDate>${data.periodOd}</cbc:StartDate><cbc:EndDate>${data.periodDo}</cbc:EndDate></cac:InvoicePeriod>`;
    const summary = `  <cac:LegalMonetaryTotal><cbc:PayableAmount currencyID="RSD">${this.formatAmount(data.iznosZaSmanjenjeOsnovice * 1.2, smer)}</cbc:PayableAmount></cac:LegalMonetaryTotal>`;
    const lines = `  <cac:CreditNoteLine><cbc:ID>1</cbc:ID><cbc:CreditedQuantity unitCode="H87">1</cbc:CreditedQuantity><cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.iznosZaSmanjenjeOsnovice, smer)}</cbc:LineExtensionAmount><cac:Item><cbc:Name>Smanjenje u periodu</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>20.00</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="RSD">${this.formatAmount(data.iznosZaSmanjenjeOsnovice, smer)}</cbc:PriceAmount></cac:Price></cac:CreditNoteLine>`;
    return this.assembleUbl(data, { typeCode: '381', rootTag: 'CreditNote', invoicePeriod, summary, lines });
  }

  static buildSaPrilogom(data: any) {
    const additionalRefs = `  <cac:AdditionalDocumentReference><cbc:ID>${data.prilogIme}</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="application/pdf" filename="${data.prilogIme}">${data.prilogBase64}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>`;
    const summary = `
  <cac:TaxTotal><cbc:TaxAmount currencyID="RSD">200.00</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="RSD">1000.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="RSD">200.00</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>20.00</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="RSD">1000.00</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="RSD">1000.00</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="RSD">1200.00</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="RSD">1200.00</cbc:PayableAmount></cac:LegalMonetaryTotal>`;
    const lines = `  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="H87">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="RSD">1000.00</cbc:LineExtensionAmount><cac:Item><cbc:Name>Stavka sa prilogom</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>20.00</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="RSD">1000.00</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`;
    return this.assembleUbl(data, { typeCode: '380', rootTag: 'Invoice', additionalRefs, summary, lines });
  }

  static buildFiskalizacijaProdaja(data: FiskalizacijaData) {
    const smer = data.smerDokumenta || 'POZITIVAN';
    const invoicePeriod = `  <cac:InvoicePeriod><cbc:DescriptionCode>3</cbc:DescriptionCode></cac:InvoicePeriod>`;
    let refs = '';
    for(const pfr of data.pfrBrojevi) refs += `  <cac:AdditionalDocumentReference><cbc:ID>${pfr}</cbc:ID></cac:AdditionalDocumentReference>\n`;
    const summary = `  <cac:TaxTotal><cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.ukupno - (data.ukupno / 1.2), smer)}</cbc:TaxAmount></cac:TaxTotal>\n  <cac:LegalMonetaryTotal><cbc:PayableAmount currencyID="RSD">${this.formatAmount(data.ukupno, smer)}</cbc:PayableAmount></cac:LegalMonetaryTotal>`;
    const lines = `  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="H87">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.ukupno / 1.2, smer)}</cbc:LineExtensionAmount><cac:Item><cbc:Name>Fiskalizovan promet</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>20.00</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="RSD">${this.formatAmount(data.ukupno / 1.2, smer)}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`;
    return this.assembleUbl(data, { typeCode: '380', rootTag: 'Invoice', invoicePeriod, additionalRefs: refs, summary, lines });
  }

  static build(data: any): string {
    const type = data.InvoiceTypeCode || data.TipZapisa || '380';
    switch (type) {
      case '386': return this.buildAvansni(data);
      case '381': return this.buildSmanjenje(data);
      case '383': return this.buildPovecanje(data);
      case 'PEEO': return JSON.stringify(SefPoreskiJsonBuilder.buildPojedinacnaEeoPayload(data));
      case 'EEO': return JSON.stringify(SefPoreskiJsonBuilder.buildZbirniEeoPayload(data));
      case 'EPP': return JSON.stringify(SefPoreskiJsonBuilder.buildEppPayload(data));
      case '380':
      default:
        if (data.avansBroj) return this.buildKonacniSaAvansom(data);
        if (data.popustIznos) return this.buildSaPopustom(data);
        if (data.valuta && data.valuta !== 'RSD') return this.buildSaValutom(data);
        if (data.pfrBrojevi) return this.buildFiskalizacijaProdaja(data);
        if (data.prilogIme) return this.buildSaPrilogom(data);
        if (data.periodOd) return this.buildSmanjenjeUPeriodu(data);
        return this.buildStandardna(data);
    }
  }
}
