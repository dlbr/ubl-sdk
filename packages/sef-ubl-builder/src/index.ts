import type { 
  AvansData, 
  KonacniData, 
  StornoData, 
  PovecanjeData, 
  OslobodjenaData, 
  PopustData, 
  PrilogData, 
  ValutaData, 
  FiskalizacijaData, 
  SmanjenjeAvansaData, 
  SmanjenjeUPerioduData,
  ZbirniEeoData,
  PojedinacnaEeoData,
  EppData,
  BaseInvoiceData,
  StandardnaData
} from './types.js';

import { PAYMENT_MEANS } from './constants.js';

export { SefLiveValidator } from './validator.js';
export * from './types.js';

/**
 * Poreski JSON Builder za EEO/EPP.
 */
export class SefPoreskiJsonBuilder {
  private static num(val: any, fallback: number = 0): number {
    const n = parseFloat(val);
    return isNaN(n) ? fallback : n;
  }

  static buildZbirniEeoPayload(data: ZbirniEeoData) {
    const [y, m] = data.poreskiPeriod.split('-').map(Number);
    return {
      Year: y, Month: m,
      TaxRecords: [
        { TaxRatePercentage: 20, Amount: parseFloat(this.num(data.osnovicaOpsta).toFixed(2)), TaxAmount: parseFloat(this.num(data.pdvOpsta).toFixed(2)) },
        { TaxRatePercentage: 10, Amount: parseFloat(this.num(data.osnovicaPosebna).toFixed(2)), TaxAmount: parseFloat(this.num(data.pdvPosebna).toFixed(2)) }
      ]
    };
  }
  static buildPojedinacnaEeoPayload(data: PojedinacnaEeoData) {
    const [y, m] = data.poreskiPeriod.split('-').map(Number);
    const isCancellation = data.isCancellation || false;

    const payload: any = {
      Year: y,
      Month: m,
      Type: isCancellation ? "Cancellation" : "IndividualInternalInvoice",
      InternalInvoiceNumber: data.internalInvoiceNumber,
      TaxRecords: [],
      relatedVatRecords: data.relatedInternalNumber ? [{
        internalInvoiceNumber: data.relatedInternalNumber
      }] : []
    };

    if (isCancellation) {
      payload.TaxRecords.push({ TaxRatePercentage: 20, Amount: 0.00, TaxAmount: 0.00 });
    } else {
      if (data.osnovicaOpsta || data.pdvOpsta) {
        payload.TaxRecords.push({ TaxRatePercentage: 20, Amount: parseFloat(this.num(data.osnovicaOpsta).toFixed(2)), TaxAmount: parseFloat(this.num(data.pdvOpsta).toFixed(2)) });
      }
      if (data.osnovicaPosebna || data.pdvPosebna) {
        payload.TaxRecords.push({ TaxRatePercentage: 10, Amount: parseFloat(this.num(data.osnovicaPosebna).toFixed(2)), TaxAmount: parseFloat(this.num(data.pdvPosebna).toFixed(2)) });
      }
    }

    return payload;
  }
  static buildEppPayload(data: EppData) {
    const [y, m] = data.period.split('-').map(Number);
    return {
      Year: y, Month: m,
      InputTaxRecords: [
        { Type: "PurchaseInvoiced", TaxAmount: parseFloat(this.num(data.prethodniPorezOdObveznika).toFixed(2)) },
        { Type: "Import", TaxAmount: parseFloat(this.num(data.importPdvCarina).toFixed(2)) }
      ]
    };
  }
}

/**
 * SefUblBuilder v4.12.3 — Steel Master Builder Alignment.
 */
export class SefUblBuilder {

  static validatePib(pib: string): boolean {
    if (!/^\d{9}$/.test(pib)) throw new Error('PIB mora imati tačno 9 cifara');
    return true;
  }

  static validateBusinessRules(data: any) {
    if (!data.ID || !data.broj || !data.datumIzdavanja || !data.pibProdavca || !data.pibKupca) {
      throw new Error('Nedostaju obavezna polja (ID, broj, datum, PIB)');
    }

    const amount = this.ensure(data.LegalMonetaryTotal?.PayableAmount || data.osnovica);
    if (amount < 0) throw new Error('Iznos ne može biti negativan');

    if (data.TaxTotals) {
      for (const tax of data.TaxTotals) {
        for (const sub of tax.Subtotals) {
          if (sub.Category === 'S20' && sub.Percent !== 20) throw new Error('Neispravna poreska stopa za S20');
        }
      }
    }
  }

  private static ensure(val: any, fallback: number = 0): number {
    const num = parseFloat(val);
    return isNaN(num) ? fallback : num;
  }

  private static format(a: number = 0, s: 'POZITIVAN' | 'NEGATIVAN' = 'POZITIVAN'): string {
    const val = Math.abs(this.ensure(a));
    const result = s === 'NEGATIVAN' ? -val : val;
    return result.toFixed(2);
  }

  private static getNamespaces(isCN: boolean): string {
    const urn = isCN ? 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2' : 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
    return `xmlns="${urn}" 
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" 
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" 
  xmlns:cec="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
  xmlns:sbt="http://faktura.mfin.gov.rs/sefs/ubl/standard-business-document-extension-2"`;
  }

  private static buildSrbDtExt(data: any): string {
    if (data.avansBroj || data.referentniRacun || data.odbitakAvansaSaPdv) {
      return `
  <cec:UBLExtensions>
    <cec:UBLExtension>
      <cec:ExtensionContent>
        <sbt:SrbDtExt>
          <sbt:InvoicedPrepaymentAmount>
            <cbc:ID>${data.avansBroj || data.referentniRacun}</cbc:ID>
            <cac:TaxTotal><cbc:TaxAmount currencyID="RSD">${this.format(data.avansPdv || 0)}</cbc:TaxAmount></cac:TaxTotal>
          </sbt:InvoicedPrepaymentAmount>
        </sbt:SrbDtExt>
      </cec:ExtensionContent>
    </cec:UBLExtension>
  </cec:UBLExtensions>`;
    }
    return '';
  }

  private static buildBillingRef(data: any): string {
    if (data.referentniRacun || data.avansBroj) {
      const id = data.referentniRacun || data.avansBroj;
      const date = data.referentniDatum || data.avansDatum || data.datumIzdavanja || new Date().toISOString().split('T')[0];
      return `
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${id}</cbc:ID>
      <cbc:IssueDate>${date}</cbc:IssueDate>
      <cbc:DocumentTypeCode>${data.tipReferentnogDokumenta || '380'}</cbc:DocumentTypeCode>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>`;
    }
    return '';
  }

  private static buildInvoicePeriod(type: string, data: any): string {
    // DescriptionCode 35 is mandatory for 380/383. Also used for CN 381 if period data is present.
    const is380_383 = (type === '380' || type === '383');
    if (is380_383 || data.periodOd) {
      return `<cac:InvoicePeriod><cbc:DescriptionCode>35</cbc:DescriptionCode></cac:InvoicePeriod>`;
    }
    return '';
  }

  private static buildParty(role: 'Supplier' | 'Customer', pib: string, name: string, data: any): string {
    const isCustomer = role === 'Customer';
    const mb = isCustomer ? data.maticniBrojKupca : data.maticniBrojProdavca;
    const jbkjs = isCustomer ? data.jbkjs : data.jbkjsProdavca;
    
    // Address data
    const adresa = isCustomer ? data.adresaKupca : data.adresaProdavca;
    const grad = isCustomer ? data.gradKupca : data.gradProdavca;
    const pibZip = isCustomer ? data.postanskiBrojKupca : data.postanskiBrojProdavca;

    // Rule: JBKJS identification if present, otherwise CompanyID (MB)
    const partyIdent = jbkjs 
      ? `<cac:PartyIdentification><cbc:ID>JBKJS:${jbkjs}</cbc:ID></cac:PartyIdentification>`
      : (mb ? `<cac:PartyIdentification><cbc:ID>${mb}</cbc:ID></cac:PartyIdentification>` : '');

    return `
  <cac:Accounting${role}Party>
    <cac:Party>
      <cbc:EndpointID schemeID="9948">${pib}</cbc:EndpointID>
      ${partyIdent}
      <cac:PostalAddress>
        <cbc:StreetName>${adresa || 'Ulica'}</cbc:StreetName>
        <cbc:CityName>${grad || 'Grad'}</cbc:CityName>
        <cbc:PostalZone>${pibZip || '11000'}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>RS</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme><cbc:CompanyID>RS${pib}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${name}</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:Accounting${role}Party>`;
  }

  private static buildDelivery(data: any, type: string): string {
    if ((type === '380' || type === '381') && (data.datumPrometa || data.datumIzdavanja)) {
      return `
  <cac:Delivery>
    <cbc:ActualDeliveryDate>${data.datumPrometa || data.datumIzdavanja}</cbc:ActualDeliveryDate>
  </cac:Delivery>`;
    }
    return '';
  }

  private static assemble(data: any, type: string, root: 'Invoice' | 'CreditNote', body: { summary: string; lines: string; }): string {
    const isCN = root === 'CreditNote';
    const today = new Date().toISOString().split('T')[0];

    const extension = this.buildSrbDtExt(data);
    const namespaces = this.getNamespaces(isCN);
    const customization = `<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.rs:srbdt:2.1</cbc:CustomizationID>`;
    const id = `<cbc:ID>${data.broj}</cbc:ID>`;
    const date = `<cbc:IssueDate>${data.datumIzdavanja || data.datum || today}</cbc:IssueDate>`;
    const typeCode = `<cbc:${isCN ? 'CreditNoteTypeCode' : 'InvoiceTypeCode'}>${type}</cbc:${isCN ? 'CreditNoteTypeCode' : 'InvoiceTypeCode'}>${data.extra_notes || ''}`;
    const currency = `<cbc:DocumentCurrencyCode>${data.valuta || 'RSD'}</cbc:DocumentCurrencyCode>`;
    const period = this.buildInvoicePeriod(type, data);
    const billing = this.buildBillingRef(data);
    const supplier = this.buildParty('Supplier', data.pibProdavca, data.nazivProdavca || 'PRODAVAC', data);
    const customer = this.buildParty('Customer', data.pibKupca, data.nazivKupca || 'KUPAC', data);
    const delivery = this.buildDelivery(data, type);
    const payment = `<cac:PaymentMeans><cbc:PaymentMeansCode>${PAYMENT_MEANS.CREDIT_TRANSFER}</cbc:PaymentMeansCode><cac:PayeeFinancialAccount><cbc:ID>${data.brojRacunaProdavca || '000-0000000000000-00'}</cbc:ID></cac:PayeeFinancialAccount></cac:PaymentMeans>`;

    return `<?xml version="1.0" encoding="utf-8"?>
<${root} ${namespaces}>
  ${extension}
  ${customization}
  ${id}
  ${date}
  ${typeCode}
  ${currency}
  ${period}
  ${billing}
  ${supplier}
  ${customer}
  ${delivery}
  ${payment}
  ${body.summary}
  ${body.lines}
</${root}>`.trim();
  }

  private static buildTaxCategoryContent(cat: string, rate: string): string {
    // Rule: DescriptionCode is PROHIBITED in TaxCategory/ClassifiedTaxCategory.
    return `<cbc:ID>${cat}</cbc:ID><cbc:Percent>${rate}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>`;
  }

  static buildStandardna(data: StandardnaData, type: string = '380') {
    const s = data.smerDokumenta || 'POZITIVAN';
    const osn = this.ensure(data.osnovica);
    const cat = data.poreskaKategorija || 'S';
    // FORCE 0.00 tax for category N
    const pdv = (cat === 'N') ? 0 : this.ensure(data.pdv);
    const rate = (cat === 'N' || cat === 'E') ? '0.00' : (this.ensure(data.pdvStopa, 20)).toFixed(2);

    const summary = `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.format(pdv, s)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.format(osn, s)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.format(pdv, s)}</cbc:TaxAmount>
      <cac:TaxCategory>${this.buildTaxCategoryContent(cat, rate)}</cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RSD">${this.format(osn, s)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RSD">${this.format(osn, s)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RSD">${this.format(osn + pdv, s)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RSD">${this.format(osn + pdv, s)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;

    const lines = `<cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="H87">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="RSD">${this.format(osn, s)}</cbc:LineExtensionAmount><cac:Item><cbc:Name>${data.item_name || 'Promet'}</cbc:Name><cac:ClassifiedTaxCategory>${this.buildTaxCategoryContent(cat, rate)}</cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="RSD">${this.format(osn, s)}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`;

    return this.assemble(data, type, 'Invoice', { summary, lines });
  }

  static buildAvansni(data: AvansData) { return this.buildStandardna(data as any, '386'); }

  static buildSmanjenje(data: StornoData) {
    const s = data.smerDokumenta || 'NEGATIVAN';
    const d = data as any;
    const osn = this.ensure(d.iznosZaSmanjenjeOsnovice || d.osnovica);
    const cat = data.poreskaKategorija || 'S';
    // FORCE 0.00 tax for category N
    const pdv = (cat === 'N') ? 0 : this.ensure(d.iznosZaSmanjenjePdv || d.pdv);
    const rate = (cat === 'N' || cat === 'E') ? '0.00' : (this.ensure(d.pdvStopa, 20)).toFixed(2);

    const summary = `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.format(pdv, s)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.format(osn, s)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.format(pdv, s)}</cbc:TaxAmount>
      <cac:TaxCategory>${this.buildTaxCategoryContent(cat, rate)}</cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RSD">${this.format(osn, s)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RSD">${this.format(osn, s)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RSD">${this.format(osn + pdv, s)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RSD">${this.format(osn + pdv, s)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;

    const lines = `<cac:CreditNoteLine><cbc:ID>1</cbc:ID><cbc:CreditedQuantity unitCode="H87">1</cbc:CreditedQuantity><cbc:LineExtensionAmount currencyID="RSD">${this.format(osn, s)}</cbc:LineExtensionAmount><cac:Item><cbc:Name>${data.razlog || 'Smanjenje'}</cbc:Name><cac:ClassifiedTaxCategory>${this.buildTaxCategoryContent(cat, rate)}</cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="RSD">${this.format(osn, s)}</cbc:PriceAmount></cac:Price></cac:CreditNoteLine>`;

    return this.assemble(data, '381', 'CreditNote', { summary, lines });
  }

  static buildPovecanje(data: PovecanjeData) { return this.buildStandardna({ ...data, osnovica: data.iznosZaPovecanjeOsnovice, pdv: data.iznosZaPovecanjePdv } as any, '383'); }

  static buildOslobodjena(data: OslobodjenaData) {
    const osn = this.ensure(data.iznos);
    const reason = `<cbc:TaxExemptionReasonCode>${data.sifraOslobodjenja || 'PDV-RS-24-1-1'}</cbc:TaxExemptionReasonCode>`;
    const summary = `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">0.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.format(osn)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">0.00</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>E</cbc:ID><cbc:Percent>0.00</cbc:Percent>${reason}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RSD">${this.format(osn)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RSD">${this.format(osn)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RSD">${this.format(osn)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RSD">${this.format(osn)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;

    const lines = `<cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="H87">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="RSD">${this.format(osn)}</cbc:LineExtensionAmount><cac:Item><cbc:Name>Promet</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>E</cbc:ID><cbc:Percent>0.00</cbc:Percent>${reason}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="RSD">${this.format(osn)}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`;

    return this.assemble(data, '380', 'Invoice', { summary, lines });
  }

  static buildKonacniSaAvansom(data: KonacniData) {
    const osn = this.ensure(data.ukupnaOsnovica);
    const pdv = this.ensure(data.ukupniPdv);
    const odbitak = this.ensure(data.odbitakAvansaSaPdv);
    const netoOdbitka = odbitak / 1.2;
    const pdvOdbitka = odbitak - netoOdbitka;
    const ukupno = (osn + pdv) - odbitak;

    const summary = `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.format(pdv - pdvOdbitka)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.format(osn - netoOdbitka)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.format(pdv - pdvOdbitka)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>20.00</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RSD">${this.format(osn - netoOdbitka)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RSD">${this.format(osn - netoOdbitka)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RSD">${this.format(ukupno)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RSD">${this.format(ukupno)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;

    const lines = `<cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="H87">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="RSD">${this.format(osn)}</cbc:LineExtensionAmount><cac:Item><cbc:Name>Promet</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>20.00</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="RSD">${this.format(osn)}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
  <cac:InvoiceLine><cbc:ID>AVANS-REDUKCIJA</cbc:ID><cbc:InvoicedQuantity unitCode="H87">-1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="RSD">${this.format(netoOdbitka, 'NEGATIVAN')}</cbc:LineExtensionAmount><cac:Item><cbc:Name>Umanjenje po avansu</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>20.00</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="RSD">${this.format(netoOdbitka)}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`;

    return this.assemble(data, '380', 'Invoice', { summary, lines });
  }

  static buildSmanjenjeAvansa(data: SmanjenjeAvansaData) {
    return this.buildSmanjenje({ ...data, iznosZaSmanjenjeOsnovice: data.iznosSmanjenjaOsnovice, iznosZaSmanjenjePdv: data.iznosSmanjenjaPdv } as any);
  }

  static buildSmanjenjeUPeriodu(data: SmanjenjeUPerioduData) {
    return this.buildSmanjenje({ ...data, iznosZaSmanjenjeOsnovice: data.iznosZaSmanjenjeOsnovice, iznosZaSmanjenjePdv: data.iznosZaSmanjenjePdv } as any);
  }

  static buildFiskalizacijaProdaja(data: FiskalizacijaData) {
    let notes = '';
    data.pfrBrojevi.forEach(pfr => notes += `<cbc:Note>Референтни број обрасца: ${pfr}</cbc:Note>`);
    
    // We cast to any to inject 'notes' property which assemble() will pick up if we update it
    const d = { 
      ...data, 
      osnovica: data.ukupno/1.2, 
      pdv: data.ukupno - data.ukupno/1.2,
      extra_notes: notes 
    } as any;
    
    return this.buildStandardna(d);
  }

  static validate386(data: any) {
    const errors = [];
    
    if (!data.datumUplate) errors.push("Nedostaje datum uplate (PaymentDueDate)");
    if (!data.osnovica || data.osnovica <= 0) errors.push("Iznos avansa mora biti > 0");
    if (!data.broj || !data.broj.includes('AV')) {
      errors.push("Broj fakture za avans mora imati prefiks AV (preporuka)");
    }
    
    // Provera ekstenzije (SrbDtExt)
    if (!data.avansBroj && !data.referentniRacun) {
      errors.push("Nedostaje SrbDtExt ekstenzija (avansBroj/referentniRacun)");
    }

    if (errors.length > 0) {
      throw new Error(`[Shield-386] Faktura neispravna: ${errors.join(', ')}`);
    }
  }

  static validate381(data: any) {
    const errors = [];
    if (!data.billingReference || !data.billingReference.invoiceId) {
      errors.push("Tip 381 zahteva BillingReference (ID originalne fakture)");
    }
    if (!data.billingReference?.issueDate) {
      errors.push("Tip 381 zahteva IssueDate originalne fakture");
    }
    if (!data.correctionReason) {
      errors.push("Razlog korekcije (Note) je obavezan");
    }
    if (errors.length > 0) {
      throw new Error(`[Shield-381] Neispravno knjižno odobrenje: ${errors.join(', ')}`);
    }
  }

  static build(data: any): string {
    this.validateBusinessRules(data);
    const type = data.InvoiceTypeCode || data.TipZapisa || '380';
    if (type === '386') this.validate386(data);
    if (type === '381') this.validate381(data);
    
    // ... rest of the build method
    if (type === 'EEO') return JSON.stringify(SefPoreskiJsonBuilder.buildZbirniEeoPayload(data));
    if (type === 'PEEO') return JSON.stringify(SefPoreskiJsonBuilder.buildPojedinacnaEeoPayload(data));
    if (type === 'EPP') return JSON.stringify(SefPoreskiJsonBuilder.buildEppPayload(data));
    
    switch (type) {
      case '386': return this.buildAvansni(data);
      case '381': 
        if (data.avansBroj) return this.buildSmanjenjeAvansa(data);
        if (data.periodOd) return this.buildSmanjenjeUPeriodu(data);
        return this.buildSmanjenje(data);
      case '383': return this.buildPovecanje(data);
      case '380':
        if (data.avansBroj) return this.buildKonacniSaAvansom(data);
        if (data.sifraOslobodjenja) return this.buildOslobodjena(data);
        if (data.pfrBrojevi) return this.buildFiskalizacijaProdaja(data);
        return this.buildStandardna(data);
      default: return this.buildStandardna(data);
    }
  }
}
