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
  EppData 
} from './types';

export { SefLiveValidator } from './validator';
export * from './types';

/**
 * SefPoreskiJsonBuilder - Generates official JSON payloads for SEF tax records (EEO/EPP).
 */
export class SefPoreskiJsonBuilder {
  
  // Zvanični format za Zbirnu evidenciju obračuna PDV-a (Član 4)
  static buildZbirniEeoPayload(data: ZbirniEeoData) {
    const [year, month] = data.poreskiPeriod.split('-').map(Number);
    return {
      Year: year,
      Month: month,
      TaxRecords: [
        {
          TaxRatePercentage: 20.00,
          Amount: parseFloat(data.osnovicaOpsta.toFixed(2)),
          TaxAmount: parseFloat(data.pdvOpsta.toFixed(2))
        },
        {
          TaxRatePercentage: 10.00,
          Amount: parseFloat(data.osnovicaPosebna.toFixed(2)),
          TaxAmount: parseFloat(data.pdvPosebna.toFixed(2))
        }
      ]
    };
  }

  // Zvanični format za Pojedinačnu evidenciju - Interni račun (Pravilnik 30/2026)
  static buildPojedinacniEeoInterniRacun(data: {
    godina: number;
    mesec: number;
    pibDobavljaca: string;
    interniBrojRacuna: string;
    osnovica: number;
    pdv: number;
  }) {
    return {
      Year: data.godina,
      Month: data.mesec,
      Type: "IndividualInternalInvoice",
      SupplierPib: `RS${data.pibDobavljaca}`,
      InternalInvoiceNumber: data.interniBrojRacuna,
      TaxSubtotal: {
        Amount: parseFloat(data.osnovica.toFixed(2)),
        TaxAmount: parseFloat(data.pdv.toFixed(2)),
        TaxRatePercentage: 20.00
      }
    };
  }

  // Zvanični format za Pojedinačnu evidenciju obračuna PDV-a
  static buildPojedinacnaEeoPayload(data: PojedinacnaEeoData) {
    const [year, month] = data.poreskiPeriod.split('-').map(Number);
    return {
      Year: year,
      Month: month,
      Type: "IndividualInternalInvoice",
      InternalInvoiceNumber: data.internalInvoiceNumber,
      TaxRecords: [
        {
          TaxRatePercentage: 20.00,
          Amount: parseFloat(data.osnovicaOpsta.toFixed(2)),
          TaxAmount: parseFloat(data.pdvOpsta.toFixed(2))
        },
        {
          TaxRatePercentage: 10.00,
          Amount: parseFloat(data.osnovicaPosebna.toFixed(2)),
          TaxAmount: parseFloat(data.pdvPosebna.toFixed(2))
        }
      ]
    };
  }

  // Zvanični format za Evidenciju prethodnog poreza (EPP)
  static buildEppPayload(data: EppData) {
    const [year, month] = data.period.split('-').map(Number);
    return {
      Year: year,
      Month: month,
      InputTaxRecords: [
        {
          Type: "PurchaseInvoiced",
          TaxAmount: parseFloat(data.prethodniPorezOdObveznika.toFixed(2))
        },
        {
          Type: "Import",
          TaxAmount: parseFloat(data.importPdvCarina.toFixed(2))
        }
      ]
    };
  }
}

/**
 * SefUblBuilder - Generates UBL 2.1 compliant XML for various SEF document types.
 * Hardened for Edge runtime (no Node.js dependencies).
 * v3.8.0 Master Specifikacija (April 2026) Compliance.
 */
export class SefUblBuilder {

  private static formatAmount(amount: number | undefined, smer: 'POZITIVAN' | 'NEGATIVAN' = 'POZITIVAN'): string {
    if (amount === undefined || amount === null || isNaN(amount)) return '0.00';
    const absoluteValue = Math.abs(amount);
    return smer === 'NEGATIVAN' ? `-${absoluteValue.toFixed(2)}` : absoluteValue.toFixed(2);
  }

  private static buildBaseInvoice(data: any, typeCode: string, rootTag: string = 'Invoice', extraNodes: string = '') {
    const urn = rootTag === 'CreditNote' ? 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2' : 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
    const typeTag = rootTag === 'CreditNote' ? 'CreditNoteTypeCode' : 'InvoiceTypeCode';
    
    let billingReferenceXml = '';
    if (data.tipDokumenta === '380' && data.avansneReference && data.avansneReference.length > 0) {
      billingReferenceXml = data.avansneReference.map((ref: any) => `
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${ref.brojAvansnogRacuna}</cbc:ID>
      <cbc:UUID>${ref.idSefAvansa}</cbc:UUID>
      <cbc:DocumentTypeCode>386</cbc:DocumentTypeCode>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>`).join('\n');
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<${rootTag} xmlns="${urn}"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:cec="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
         xmlns:sbt="http://mfin.gov.rs/srbdt/srbdtext">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.rs:srbdt:2022</cbc:CustomizationID>
  <cbc:ID>${data.broj}</cbc:ID>
  <cbc:IssueDate>${data.datumIzdavanja || '2026-05-21'}</cbc:IssueDate>`;

    if (rootTag === 'Invoice') {
      xml += `\n  <cbc:DueDate>${data.datumDospeca || '2026-05-21'}</cbc:DueDate>`;
    }
    
    xml += `\n  <cbc:${typeTag}>${typeCode}</cbc:${typeTag}>
  <cbc:DocumentCurrencyCode>${data.valuta || 'RSD'}</cbc:DocumentCurrencyCode>
${billingReferenceXml}
${extraNodes}
  <cac:AccountingSupplierParty>
    <cac:Party><cac:PartyTaxScheme><cbc:CompanyID>RS${data.pibProdavca}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme></cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party><cac:PartyTaxScheme><cbc:CompanyID>RS${data.pibKupca}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme></cac:Party>
  </cac:AccountingCustomerParty>`;
    return xml;
  }

  // 1. Avansna faktura (386)
  static buildAvansni(data: AvansData) {
    const smer = data.smerDokumenta || 'POZITIVAN';
    const taxCat = data.poreskaKategorija || 'S';
    const stopa = data.pdvStopa || 20.00;
    const xml = this.buildBaseInvoice(data, '386');
    const ukupno = (data.osnovica || 0) + (data.pdv || 0);
    return xml + `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.pdv, smer)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(data.osnovica, smer)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.pdv, smer)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>${taxCat}</cbc:ID><cbc:Percent>${stopa.toFixed(2)}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.osnovica, smer)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RSD">${this.formatAmount(data.osnovica, smer)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RSD">${this.formatAmount(ukupno, smer)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount(ukupno, smer)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`.trim();
  }

  // 2. Konačna faktura sa zatvaranjem avansa (380)
  static buildKonacniSaAvansom(data: KonacniData) {
    const smer = data.smerDokumenta || 'POZITIVAN';
    const taxCat = data.poreskaKategorija || 'S';
    const stopa = data.pdvStopa || 20;
    const ukupnoSve = (data.ukupnaOsnovica || 0) + (data.ukupniPdv || 0);
    const zaUplatu = ukupnoSve - (data.odbitakAvansaSaPdv || 0);
    
    const extraNodes = `  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${data.avansBroj}</cbc:ID>
      <cbc:IssueDate>${data.avansDatum}</cbc:IssueDate>
      <cbc:DocumentTypeCode>386</cbc:DocumentTypeCode>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>`;

    const lineOsnovica = data.odbitakAvansaSaPdv / (1 + (stopa / 100));
    const linePdv = data.odbitakAvansaSaPdv - lineOsnovica;
    
    const advanceLine = `
  <cac:InvoiceLine>
    <cbc:ID>AVANS-REDUKCIJA</cbc:ID>
    <cbc:InvoicedQuantity unitCode="H87">-1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="RSD">-${lineOsnovica.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>Umanjenje po avansnom računu ${data.avansBroj}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${taxCat}</cbc:ID>
        <cbc:Percent>${stopa.toFixed(2)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="RSD">${lineOsnovica.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;

    const xml = this.buildBaseInvoice(data, '380', 'Invoice', extraNodes + advanceLine);
    return xml + `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.ukupniPdv - linePdv, smer)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(data.ukupnaOsnovica - lineOsnovica, smer)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.ukupniPdv - linePdv, smer)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${taxCat}</cbc:ID>
        <cbc:Percent>${stopa.toFixed(2)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.ukupnaOsnovica - lineOsnovica, smer)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RSD">${this.formatAmount(data.ukupnaOsnovica - lineOsnovica, smer)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RSD">${this.formatAmount(ukupnoSve - data.odbitakAvansaSaPdv, smer)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount(zaUplatu, smer)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`.trim();
  }

  // 3. Dokument o povecanju (Knjižno zaduženje 383)
  static buildPovecanje(data: PovecanjeData) {
    const smer = data.smerDokumenta || 'POZITIVAN';
    const taxCat = data.poreskaKategorija || 'S';
    const stopa = data.pdvStopa || 20.00;
    const extraNodes = `  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${data.referentniRacun}</cbc:ID>
      <cbc:IssueDate>${data.datumReferentnog}</cbc:IssueDate>
      <cbc:DocumentTypeCode>380</cbc:DocumentTypeCode>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>`;
    const xml = this.buildBaseInvoice(data, '383', 'Invoice', extraNodes);
    const ukupno = (data.iznosZaPovecanjeOsnovice || 0) + (data.iznosZaPovecanjePdv || 0);
    return xml + `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.iznosZaPovecanjePdv, smer)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(data.iznosZaPovecanjeOsnovice, smer)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.iznosZaPovecanjePdv, smer)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>${taxCat}</cbc:ID><cbc:Percent>${stopa.toFixed(2)}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.iznosZaPovecanjeOsnovice, smer)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RSD">${this.formatAmount(data.iznosZaPovecanjeOsnovice, smer)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RSD">${this.formatAmount(ukupno, smer)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount(ukupno, smer)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`.trim();
  }

  // 4. Dokument o smanjenju po osnovu smanjenja avansa (381 sa SrbDtExt)
  static buildSmanjenjeAvansa(data: SmanjenjeAvansaData) {
    const smer = data.smerDokumenta || 'NEGATIVAN'; 
    const taxCat = data.poreskaKategorija || 'S';
    const stopa = data.pdvStopa || 20.00;
    const extension = `<cec:UBLExtensions>
        <cec:UBLExtension>
          <cec:ExtensionContent>
            <sbt:SrbDtExt>
              <sbt:InvoicedPrepaymentAmount>
                <cbc:ID>${data.avansBroj}</cbc:ID>
                <cac:TaxTotal>
                  <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.iznosSmanjenjaPdv, smer)}</cbc:TaxAmount>
                  <cac:TaxSubtotal>
                    <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(data.iznosSmanjenjaOsnovice, smer)}</cbc:TaxableAmount>
                    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.iznosSmanjenjaPdv, smer)}</cbc:TaxAmount>
                    <cac:TaxCategory><cbc:ID>${taxCat}</cbc:ID><cbc:Percent>${stopa.toFixed(2)}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
                  </cac:TaxSubtotal>
                </cac:TaxTotal>
              </sbt:InvoicedPrepaymentAmount>
              <sbt:ReducedTotals>
                <cac:TaxTotal>
                  <cbc:TaxAmount currencyID="RSD">0.00</cbc:TaxAmount>
                  <cac:TaxSubtotal>
                    <cbc:TaxableAmount currencyID="RSD">0.00</cbc:TaxableAmount>
                    <cbc:TaxAmount currencyID="RSD">0.00</cbc:TaxAmount>
                    <cac:TaxCategory><cbc:ID>${taxCat}</cbc:ID><cbc:Percent>${stopa.toFixed(2)}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
                  </cac:TaxSubtotal>
                </cac:TaxTotal>
                <cac:LegalMonetaryTotal>
                  <cbc:TaxExclusiveAmount currencyID="RSD">${this.formatAmount(data.iznosSmanjenjaOsnovice, smer)}</cbc:TaxExclusiveAmount>
                  <cbc:TaxInclusiveAmount currencyID="RSD">0.00</cbc:TaxInclusiveAmount>
                  <cbc:PayableAmount currencyID="RSD">0.00</cbc:PayableAmount>
                </cac:LegalMonetaryTotal>
              </sbt:ReducedTotals>
            </sbt:SrbDtExt>
          </cec:ExtensionContent>
        </cec:UBLExtension>
      </cec:UBLExtensions>`;
      
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:cec="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
         xmlns:sbt="http://mfin.gov.rs/srbdt/srbdtext">
${extension}
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.rs:srbdt:2022</cbc:CustomizationID>
  <cbc:ID>${data.broj}</cbc:ID>
  <cbc:IssueDate>${data.datumIzdavanja || '2026-05-21'}</cbc:IssueDate>
  <cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>
  <cbc:DocumentCurrencyCode>RSD</cbc:DocumentCurrencyCode>
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${data.avansBroj}</cbc:ID>
      <cbc:IssueDate>${data.avansDatum}</cbc:IssueDate>
      <cbc:DocumentTypeCode>386</cbc:DocumentTypeCode>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyTaxScheme><cbc:CompanyID>RS${data.pibProdavca}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyTaxScheme><cbc:CompanyID>RS${data.pibKupca}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme></cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.iznosSmanjenjaPdv, smer)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(data.iznosSmanjenjaOsnovice, smer)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.iznosSmanjenjaPdv, smer)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>${taxCat}</cbc:ID><cbc:Percent>${stopa.toFixed(2)}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.iznosSmanjenjaOsnovice, smer)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RSD">${this.formatAmount(data.iznosSmanjenjaOsnovice, smer)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RSD">${this.formatAmount((data.iznosSmanjenjaOsnovice || 0) + (data.iznosSmanjenjaPdv || 0), smer)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount((data.iznosSmanjenjaOsnovice || 0) + (data.iznosSmanjenjaPdv || 0), smer)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</CreditNote>`.trim();
    return xml;
  }

  // 5. Dokument o smanjenju u periodu (381 InvoicePeriod)
  static buildSmanjenjeUPeriodu(data: SmanjenjeUPerioduData) {
    const smer = data.smerDokumenta || 'NEGATIVAN';
    const taxCat = data.poreskaKategorija || 'S';
    const stopa = data.pdvStopa || 20.00;
    const extraNodes = `  <cac:InvoicePeriod>
    <cbc:StartDate>${data.periodOd}</cbc:StartDate>
    <cbc:EndDate>${data.periodDo}</cbc:EndDate>
    <cbc:DescriptionCode>${data.opisKod || '35'}</cbc:DescriptionCode>
  </cac:InvoicePeriod>`;
    const xml = this.buildBaseInvoice(data, '381', 'CreditNote', extraNodes);
    const ukupnoSmanjenje = (data.iznosZaSmanjenjeOsnovice || 0) + (data.iznosZaSmanjenjePdv || 0);
    return xml + `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.iznosZaSmanjenjePdv, smer)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(data.iznosZaSmanjenjeOsnovice, smer)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.iznosZaSmanjenjePdv, smer)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>${taxCat}</cbc:ID><cbc:Percent>${stopa.toFixed(2)}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount(ukupnoSmanjenje, smer)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</CreditNote>`.trim();
  }

  // 6. Dokument o smanjenju za vise faktura (381 Multiple BillingReferences)
  static buildSmanjenjeViseFaktura(data: SmanjenjeViseFakturaData) {
    const smer = data.smerDokumenta || 'NEGATIVAN';
    let references = '';
    for (const ref of data.fakture) {
      references += `
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${ref.id}</cbc:ID>
      <cbc:IssueDate>${ref.datum}</cbc:IssueDate>
      <cbc:DocumentTypeCode>380</cbc:DocumentTypeCode>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>`;
    }
    const xml = this.buildBaseInvoice(data, '381', 'CreditNote', references);
    return xml + `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.iznosSmanjenjaPdv, smer)}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount((data.iznosZaSmanjenjeOsnovice || 0) + (data.iznosSmanjenjaPdv || 0), smer)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</CreditNote>`.trim();
  }

  // 7. Dokument o smanjenju (Obicno 381)
  static buildSmanjenje(data: StornoData) {
    const smer = data.smerDokumenta || 'NEGATIVAN';
    const taxCat = data.poreskaKategorija || 'S';
    const stopa = data.pdvStopa !== undefined ? data.pdvStopa : (taxCat === 'N' || taxCat === 'E' || taxCat === 'Z' ? 0.00 : 20.00);
    const extraNodes = `  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${data.referentniRacun}</cbc:ID>
      <cbc:DocumentDescription>${data.razlog || ''}</cbc:DocumentDescription>
      <cbc:DocumentTypeCode>380</cbc:DocumentTypeCode>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>`;
    const xml = this.buildBaseInvoice(data, '381', 'CreditNote', extraNodes);
    return xml + `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.iznosZaSmanjenjePdv, smer)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(data.iznosZaSmanjenjeOsnovice, smer)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.iznosZaSmanjenjePdv, smer)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>${taxCat}</cbc:ID><cbc:Percent>${stopa.toFixed(2)}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount((data.iznosZaSmanjenjeOsnovice || 0) + (data.iznosZaSmanjenjePdv || 0), smer)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</CreditNote>`.trim();
  }

  // 8. Faktura sa oslobođenjem od PDV-a (380 TaxCategory E/O/AE)
  static buildOslobodjena(data: OslobodjenaData) {
    const smer = data.smerDokumenta || 'POZITIVAN';
    const xml = this.buildBaseInvoice(data, '380');
    
    const oslobodjeneKategorije = ['E', 'Z', 'R'];
    const kat = data.poreskaKategorija || 'E';
    
    let oslobodjenjeTags = '';
    if (oslobodjeneKategorije.includes(kat)) {
      if (!data.sifraOslobodjenja) {
        throw new Error(`[Zakon 2024 Oklop] Šifra poreskog oslobođenja je zakonski obavezna za kategoriju ${kat}!`);
      }
      const reasonMapping: Record<string, string> = {
        'PDV-RS-24-1-1': 'Oslobođeno plaćanja PDV-a po članu 24. stav 1. tačka 1. Zakona o PDV',
        'PDV-RS-10-2-3': 'Prenos poreske obaveze po članu 10. stav 2. tačka 3. Zakona o PDV'
      };
      const reason = reasonMapping[data.sifraOslobodjenja] || 'Oslobođeno plaćanja PDV-a po zakonu.';
      oslobodjenjeTags = `
        <cbc:TaxExemptionReasonCode>${data.sifraOslobodjenja}</cbc:TaxExemptionReasonCode>
        <cbc:TaxExemptionReason>${reason}</cbc:TaxExemptionReason>`;
    }

    return xml + `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">0.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(data.iznos, smer)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">0.00</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${kat}</cbc:ID>
        <cbc:Percent>0.00</cbc:Percent>${oslobodjenjeTags}
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.iznos, smer)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RSD">${this.formatAmount(data.iznos, smer)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RSD">${this.formatAmount(data.iznos, smer)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount(data.iznos, smer)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`.trim();
  }

  // 9. Faktura sa popustom (380 AllowanceCharge)
  static buildSaPopustom(data: PopustData) {
    const smer = data.smerDokumenta || 'POZITIVAN';
    const taxCat = data.poreskaKategorija || 'S';
    const stopa = data.pdvStopa || 20.00;
    const osnovica = (data.iznosPrePopusta || 0) - (data.popustIznos || 0);
    const pdv = osnovica * (stopa / 100);
    const ukupno = osnovica + pdv;
    const extraNodes = `  <cac:AllowanceCharge>
    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
    <cbc:Amount currencyID="RSD">${this.formatAmount(data.popustIznos, smer)}</cbc:Amount>
    <cac:TaxCategory><cbc:ID>${taxCat}</cbc:ID><cbc:Percent>${stopa.toFixed(2)}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
  </cac:AllowanceCharge>`;
    const xml = this.buildBaseInvoice(data, '380', 'Invoice', extraNodes);
    return xml + `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(pdv, smer)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(osnovica, smer)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.formatAmount(pdv, smer)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>${taxCat}</cbc:ID><cbc:Percent>${stopa.toFixed(2)}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.iznosPrePopusta, smer)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RSD">${this.formatAmount(osnovica, smer)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RSD">${this.formatAmount(ukupno, smer)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="RSD">${this.formatAmount(data.popustIznos, smer)}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount(ukupno, smer)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`.trim();
  }

  // 10. Faktura sa prilogom (380 AdditionalDocumentReference base64)
  static buildSaPrilogom(data: PrilogData) {
    const smer = data.smerDokumenta || 'POZITIVAN';
    const taxCat = (data as any).poreskaKategorija || 'S';
    const stopa = (data as any).pdvStopa || 20.00;
    const osnovica = (data as any).osnovica || data.ukupno / (1 + (stopa / 100));
    const pdv = (data as any).pdv || (data.ukupno - osnovica);

    const extraNodes = `  <cac:AdditionalDocumentReference>
    <cbc:ID>${data.prilogIme}</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="application/pdf" filename="${data.prilogIme}">${data.prilogBase64}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>`;

    const xml = this.buildBaseInvoice(data, '380', 'Invoice', extraNodes);
    return xml + `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(pdv, smer)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(osnovica, smer)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.formatAmount(pdv, smer)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>${taxCat}</cbc:ID><cbc:Percent>${stopa.toFixed(2)}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(osnovica, smer)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RSD">${this.formatAmount(osnovica, smer)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RSD">${this.formatAmount(data.ukupno, smer)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount(data.ukupno, smer)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`.trim();
  }

  // 11. Faktura sa valutom (380 strana valuta)
  static buildSaValutom(data: ValutaData) {
    const smer = data.smerDokumenta || 'POZITIVAN';
    const taxCat = data.poreskaKategorija || 'S';
    const stopa = data.pdvStopa || 20.00;
    
    const extraNodes = `  <cac:TaxExchangeRate>
    <cbc:SourceCurrencyCode>${data.valuta}</cbc:SourceCurrencyCode>
    <cbc:TargetCurrencyCode>RSD</cbc:TargetCurrencyCode>
    <cbc:CalculationRate>${data.kurs}</cbc:CalculationRate>
    <cbc:Date>${data.kursDatum}</cbc:Date>
  </cac:TaxExchangeRate>`;

    const xml = this.buildBaseInvoice(data, '380', 'Invoice', extraNodes);
    return xml + `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.pdvRSD, smer)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(data.osnovicaRSD, smer)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.pdvRSD, smer)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>${taxCat}</cbc:ID><cbc:Percent>${stopa.toFixed(2)}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${data.valuta}">${this.formatAmount(data.ukupnoValuta / (1 + (stopa / 100)), smer)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${data.valuta}">${this.formatAmount(data.ukupnoValuta / (1 + (stopa / 100)), smer)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${data.valuta}">${this.formatAmount(data.ukupnoValuta, smer)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${data.valuta}">${this.formatAmount(data.ukupnoValuta, smer)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`.trim();
  }

  // 12. Faktura za javnu nabavku (380 BuyerReference CRF/JBKJS)
  static buildJavnaNabavka(data: JavnaNabavkaData) {
    const smer = data.smerDokumenta || 'POZITIVAN';
    const extraNodes = `  <cbc:BuyerReference>JN-JBKJS:${data.jbkjs}</cbc:BuyerReference>
  <cac:OrderReference><cbc:ID>${data.brojUgovora}</cbc:ID></cac:OrderReference>`;
    const xml = this.buildBaseInvoice(data, '380', 'Invoice', extraNodes);
    return xml + `
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID>JBKJS:${data.jbkjs}</cbc:ID></cac:PartyIdentification>
      <cac:PartyTaxScheme><cbc:CompanyID>RS${data.pibKupca}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:LegalMonetaryTotal>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount(data.iznos, smer)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`.trim();
  }

  // 13. Standardna faktura (380)
  static buildStandardna(data: AvansData) {
    const smer = data.smerDokumenta || 'POZITIVAN';
    const taxCat = data.poreskaKategorija || 'S';
    const stopa = data.pdvStopa || 20.00;
    const ukupno = (data.osnovica || 0) + (data.pdv || 0);

    const lineXml = `
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="H87">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.osnovica, smer)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>Promet dobara i usluga</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${taxCat}</cbc:ID>
        <cbc:Percent>${stopa.toFixed(2)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="RSD">${this.formatAmount(data.osnovica, smer)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;

    const xml = this.buildBaseInvoice(data, '380', 'Invoice', lineXml);
    return xml + `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.pdv, smer)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(data.osnovica, smer)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.pdv, smer)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>${taxCat}</cbc:ID><cbc:Percent>${stopa.toFixed(2)}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.osnovica, smer)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RSD">${this.formatAmount(data.osnovica, smer)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RSD">${this.formatAmount(ukupno, smer)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount(ukupno, smer)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`.trim();
  }

  // 14. Fiskalizacija promet prodaja (380 sa PFR referencama)
  static buildFiskalizacijaProdaja(data: FiskalizacijaData) {
    const smer = data.smerDokumenta || 'POZITIVAN';
    let refs = '';
    for(const pfr of data.pfrBrojevi) {
      refs += `  <cac:AdditionalDocumentReference><cbc:ID>${pfr}</cbc:ID></cac:AdditionalDocumentReference>\n`;
    }
    const xml = this.buildBaseInvoice(data, '380', 'Invoice', refs);
    return xml + `
  <cac:LegalMonetaryTotal>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount(data.ukupno, smer)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`.trim();
  }

  // 15. Fiskalizacija promet refundacija (381 sa PFR)
  static buildFiskalizacijaRefundacija(data: FiskalizacijaData) {
    const smer = data.smerDokumenta || 'NEGATIVAN';
    let refs = '';
    for(const pfr of data.pfrBrojevi) {
      refs += `  <cac:AdditionalDocumentReference><cbc:ID>${pfr}</cbc:ID></cac:AdditionalDocumentReference>\n`;
    }
    const xml = this.buildBaseInvoice(data, '381', 'CreditNote', refs);
    return xml + `
  <cac:LegalMonetaryTotal>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount(data.ukupno, smer)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</CreditNote>`.trim();
  }

  // 16. Konacna faktura sa valutom (380 zatvara avans u valuti)
  static buildKonacnaSaValutom(data: KonacnaValutaData) {
    const smer = data.smerDokumenta || 'POZITIVAN';
    const extraNodes = `  <cac:BillingReference>
    <cac:InvoiceDocumentReference><cbc:ID>${data.avansBroj}</cbc:ID></cac:InvoiceDocumentReference>
  </cac:BillingReference>
  <cac:TaxExchangeRate>
    <cbc:SourceCurrencyCode>${data.valuta}</cbc:SourceCurrencyCode>
    <cbc:TargetCurrencyCode>RSD</cbc:TargetCurrencyCode>
    <cbc:CalculationRate>${data.kurs}</cbc:CalculationRate>
  </cac:TaxExchangeRate>`;
    const xml = this.buildBaseInvoice(data, '380', 'Invoice', extraNodes);
    return xml + `
  <cac:LegalMonetaryTotal>
    <cbc:PrepaidAmount currencyID="${data.valuta}">${this.formatAmount(data.odbitakValuta, smer)}</cbc:PrepaidAmount>
    <cbc:PayableAmount currencyID="${data.valuta}">${this.formatAmount(data.zaUplatuValuta, smer)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`.trim();
  }

  private static normalizeData(data: any) {
    const isRsdPayment = data.naplataURSD === true || data.valutaPlacanja === 'RSD';
    const kurs = data.kurs || data.kursNbs;

    if (data.valuta && data.valuta !== 'RSD' && isRsdPayment) {
      if (!kurs) {
        throw new Error("Pravilnik 30/2026: Nedostaje kurs za preračun u RSD iako je naznačena naplata u dinarima.");
      }
      data.valuta = 'RSD';
      data.osnovica = (data.osnovica || 0) * kurs;
      data.pdv = (data.pdv || 0) * kurs;
      data.ukupno = (data.ukupno || 0) * kurs;
      if (data.ukupnoValuta !== undefined) {
         data.ukupnoValuta = data.ukupnoValuta * kurs;
      }
      if (data.iznos !== undefined) data.iznos = data.iznos * kurs;
    }

    if (data.broj === undefined) data.broj = data.ID;
    if (data.pibProdavca === undefined) data.pibProdavca = data.Supplier?.Pib || data.AccountingSupplierParty?.Party?.PartyTaxScheme?.cbc_CompanyID?.replace('RS', '');
    if (data.pibKupca === undefined) data.pibKupca = data.Customer?.Pib || data.AccountingCustomerParty?.Party?.PartyTaxScheme?.cbc_CompanyID?.replace('RS', '');
    
    if (data.osnovica === undefined) {
       data.osnovica = data.LegalMonetaryTotal?.TaxExclusiveAmount || 0;
    }
    if (data.pdv === undefined) {
       data.pdv = data.TaxTotals?.[0]?.TaxAmount || (data.LegalMonetaryTotal ? (data.LegalMonetaryTotal.TaxInclusiveAmount - data.LegalMonetaryTotal.TaxExclusiveAmount) : 0);
    }

    if (data.ukupnaOsnovica === undefined) data.ukupnaOsnovica = data.osnovica;
    if (data.ukupniPdv === undefined) data.ukupniPdv = data.pdv;
    if (data.ukupno === undefined) data.ukupno = data.LegalMonetaryTotal?.PayableAmount || (data.osnovica + data.pdv);
    
    // v3.8.0 Master Specifikacija: Poreske kategorije ostaju čiste (S, AE, E, Z, R, O, N)
    if (!data.poreskaKategorija) {
      data.poreskaKategorija = 'S';
    }
    if (data.poreskaKategorija === 'S20') data.poreskaKategorija = 'S';
    if (data.poreskaKategorija === 'S10') data.poreskaKategorija = 'S';
    if (data.poreskaKategorija === 'AE20') data.poreskaKategorija = 'AE';
    if (data.poreskaKategorija === 'AE10') data.poreskaKategorija = 'AE';

    if (data.pdvStopa === undefined) {
       data.pdvStopa = 20.00;
    }

    if (!data.smerDokumenta) {
      data.smerDokumenta = 'POZITIVAN';
    }

    return data;
  }

  static build(data: any): string {
    const normalized = this.normalizeData({ ...data });
    const type = normalized.InvoiceTypeCode || normalized.TipZapisa || '380';
    switch (type) {
      case '386': return this.buildAvansni(normalized);
      case '381': return this.buildSmanjenje(normalized);
      case '383': return this.buildPovecanje(normalized);
      case 'PEEO': return JSON.stringify(SefPoreskiJsonBuilder.buildPojedinacnaEeoPayload(normalized));
      case 'EEO': return JSON.stringify(SefPoreskiJsonBuilder.buildZbirniEeoPayload(normalized));
      case 'EPP': return JSON.stringify(SefPoreskiJsonBuilder.buildEppPayload(normalized));
      case '380':
      default:
        if (normalized.avansBroj) return this.buildKonacniSaAvansom(normalized);
        if (normalized.jbkjs) return this.buildJavnaNabavka(normalized);
        if (normalized.popustIznos) return this.buildSaPopustom(normalized);
        return this.buildStandardna(normalized);
    }
  }
}
