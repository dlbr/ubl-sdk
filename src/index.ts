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
  EppData 
} from './types';

/**
 * SefUblBuilder - Generates UBL 2.1 compliant XML for various SEF document types.
 * Hardened for Edge runtime (no Node.js dependencies).
 */
export class SefUblBuilder {

  /**
   * Helper to format numbers to 2 decimal places. Defaults to 0.00 if undefined.
   */
  private static formatAmount(amount: number | undefined): string {
    if (amount === undefined || amount === null) return '0.00';
    return amount.toFixed(2);
  }

  private static buildBaseInvoice(data: any, typeCode: string, rootTag: string = 'Invoice', extraNodes: string = '') {
    const urn = rootTag === 'CreditNote' ? 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2' : 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
    const typeTag = rootTag === 'CreditNote' ? 'CreditNoteTypeCode' : 'InvoiceTypeCode';
    
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
    const xml = this.buildBaseInvoice(data, '386');
    const ukupno = (data.osnovica || 0) + (data.pdv || 0);
    return xml + `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.pdv)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(data.osnovica)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.pdv)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>20</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.osnovica)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RSD">${this.formatAmount(data.osnovica)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RSD">${this.formatAmount(ukupno)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount(ukupno)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`.trim();
  }

  // 2. Konačna faktura sa zatvaranjem avansa (380)
  static buildKonacniSaAvansom(data: KonacniData) {
    const ukupnoSve = (data.ukupnaOsnovica || 0) + (data.ukupniPdv || 0);
    const zaUplatu = ukupnoSve - (data.odbitakAvansaSaPdv || 0);
    const extraNodes = `  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${data.avansBroj}</cbc:ID>
      <cbc:IssueDate>${data.avansDatum}</cbc:IssueDate>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>`;
    const xml = this.buildBaseInvoice(data, '380', 'Invoice', extraNodes);
    return xml + `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.ukupniPdv)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(data.ukupnaOsnovica)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.ukupniPdv)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>20</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.ukupnaOsnovica)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RSD">${this.formatAmount(data.ukupnaOsnovica)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RSD">${this.formatAmount(ukupnoSve)}</cbc:TaxInclusiveAmount>
    <cbc:PrepaidAmount currencyID="RSD">${this.formatAmount(data.odbitakAvansaSaPdv)}</cbc:PrepaidAmount>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount(zaUplatu)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`.trim();
  }

  // 3. Dokument o povecanju (Knjižno zaduženje 383)
  static buildPovecanje(data: PovecanjeData) {
    const extraNodes = `  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${data.referentniRacun}</cbc:ID>
      <cbc:IssueDate>${data.datumReferentnog}</cbc:IssueDate>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>`;
    const xml = this.buildBaseInvoice(data, '383', 'Invoice', extraNodes);
    const ukupno = (data.iznosZaPovecanjeOsnovice || 0) + (data.iznosZaPovecanjePdv || 0);
    return xml + `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.iznosZaPovecanjePdv)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(data.iznosZaPovecanjeOsnovice)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.iznosZaPovecanjePdv)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>20</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.iznosZaPovecanjeOsnovice)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RSD">${this.formatAmount(data.iznosZaPovecanjeOsnovice)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RSD">${this.formatAmount(ukupno)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount(ukupno)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`.trim();
  }

  // 4. Dokument o smanjenju po osnovu smanjenja avansa (381 sa SrbDtExt)
  static buildSmanjenjeAvansa(data: SmanjenjeAvansaData) {
    const extension = `<cec:UBLExtensions>
        <cec:UBLExtension>
          <cec:ExtensionContent>
            <sbt:SrbDtExt>
              <sbt:InvoicedPrepaymentAmount>
                <cbc:ID>${data.avansBroj}</cbc:ID>
                <cac:TaxTotal>
                  <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.iznosSmanjenjaPdv)}</cbc:TaxAmount>
                  <cac:TaxSubtotal>
                    <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(data.iznosSmanjenjaOsnovice)}</cbc:TaxableAmount>
                    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.iznosSmanjenjaPdv)}</cbc:TaxAmount>
                    <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>20</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
                  </cac:TaxSubtotal>
                </cac:TaxTotal>
              </sbt:InvoicedPrepaymentAmount>
              <sbt:ReducedTotals>
                <cac:TaxTotal>
                  <cbc:TaxAmount currencyID="RSD">0.00</cbc:TaxAmount>
                  <cac:TaxSubtotal>
                    <cbc:TaxableAmount currencyID="RSD">0.00</cbc:TaxableAmount>
                    <cbc:TaxAmount currencyID="RSD">0.00</cbc:TaxAmount>
                    <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>20</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
                  </cac:TaxSubtotal>
                </cac:TaxTotal>
                <cac:LegalMonetaryTotal>
                  <cbc:TaxExclusiveAmount currencyID="RSD">${this.formatAmount(data.iznosSmanjenjaOsnovice)}</cbc:TaxExclusiveAmount>
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
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyTaxScheme><cbc:CompanyID>RS${data.pibProdavca}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyTaxScheme><cbc:CompanyID>RS${data.pibKupca}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme></cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.iznosSmanjenjaPdv)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(data.iznosSmanjenjaOsnovice)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.iznosSmanjenjaPdv)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>20</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.iznosSmanjenjaOsnovice)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RSD">${this.formatAmount(data.iznosSmanjenjaOsnovice)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RSD">${this.formatAmount((data.iznosSmanjenjaOsnovice || 0) + (data.iznosSmanjenjaPdv || 0))}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount((data.iznosSmanjenjaOsnovice || 0) + (data.iznosSmanjenjaPdv || 0))}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</CreditNote>`.trim();
    return xml;
  }

  // 5. Dokument o smanjenju u periodu (381 InvoicePeriod)
  static buildSmanjenjeUPeriodu(data: SmanjenjeUPerioduData) {
    const extraNodes = `  <cac:InvoicePeriod>
    <cbc:StartDate>${data.periodOd}</cbc:StartDate>
    <cbc:EndDate>${data.periodDo}</cbc:EndDate>
    <cbc:DescriptionCode>${data.opisKod || '35'}</cbc:DescriptionCode>
  </cac:InvoicePeriod>`;
    const xml = this.buildBaseInvoice(data, '381', 'CreditNote', extraNodes);
    const ukupnoSmanjenje = (data.iznosZaSmanjenjeOsnovice || 0) + (data.iznosZaSmanjenjePdv || 0);
    return xml + `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.iznosZaSmanjenjePdv)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(data.iznosZaSmanjenjeOsnovice)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.iznosZaSmanjenjePdv)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>20</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount(ukupnoSmanjenje)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</CreditNote>`.trim();
  }

  // 6. Dokument o smanjenju za vise faktura (381 Multiple BillingReferences)
  static buildSmanjenjeViseFaktura(data: SmanjenjeViseFakturaData) {
    let references = '';
    for (const ref of data.fakture) {
      references += `
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${ref.id}</cbc:ID>
      <cbc:IssueDate>${ref.datum}</cbc:IssueDate>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>`;
    }
    const xml = this.buildBaseInvoice(data, '381', 'CreditNote', references);
    return xml + `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.iznosSmanjenjaPdv)}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount((data.iznosZaSmanjenjeOsnovice || 0) + (data.iznosSmanjenjaPdv || 0))}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</CreditNote>`.trim();
  }

  // 7. Dokument o smanjenju (Obicno 381)
  static buildSmanjenje(data: StornoData) {
    const extraNodes = `  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${data.referentniRacun}</cbc:ID>
      <cbc:DocumentDescription>${data.razlog || ''}</cbc:DocumentDescription>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>`;
    const xml = this.buildBaseInvoice(data, '381', 'CreditNote', extraNodes);
    return xml + `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.iznosZaSmanjenjePdv)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(data.iznosZaSmanjenjeOsnovice)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.iznosZaSmanjenjePdv)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>20</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount((data.iznosZaSmanjenjeOsnovice || 0) + (data.iznosZaSmanjenjePdv || 0))}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</CreditNote>`.trim();
  }

  // 8. Faktura sa oslobođenjem od PDV-a (380 TaxCategory E/O/AE)
  static buildOslobodjena(data: OslobodjenaData) {
    const xml = this.buildBaseInvoice(data, '380');
    // OKLOP: Mapiranje šifre u tekstualni opis zakonskog člana (Obavezno za SEF)
    const reasonMapping: Record<string, string> = {
      'PDV-RS-24-1-1': 'Oslobođeno plaćanja PDV-a po članu 24. stav 1. tačka 1. Zakona o PDV',
      'PDV-RS-10-2-3': 'Prenos poreske obaveze po članu 10. stav 2. tačka 3. Zakona o PDV'
    };
    const reason = reasonMapping[data.sifraOslobodjenja] || 'Oslobođeno plaćanja PDV-a po zakonu.';

    return xml + `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">0.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(data.iznos)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">0.00</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${data.poreskaKategorija}</cbc:ID>
        <cbc:Percent>0</cbc:Percent>
        <cbc:TaxExemptionReasonCode>${data.sifraOslobodjenja}</cbc:TaxExemptionReasonCode>
        <cbc:TaxExemptionReason>${reason}</cbc:TaxExemptionReason>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.iznos)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RSD">${this.formatAmount(data.iznos)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RSD">${this.formatAmount(data.iznos)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount(data.iznos)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`.trim();
  }

  // 9. Faktura sa popustom (380 AllowanceCharge)
  static buildSaPopustom(data: PopustData) {
    const osnovica = (data.iznosPrePopusta || 0) - (data.popustIznos || 0);
    const pdv = osnovica * (data.pdvStopa / 100);
    const ukupno = osnovica + pdv;
    const extraNodes = `  <cac:AllowanceCharge>
    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
    <cbc:Amount currencyID="RSD">${this.formatAmount(data.popustIznos)}</cbc:Amount>
    <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>${data.pdvStopa}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
  </cac:AllowanceCharge>`;
    const xml = this.buildBaseInvoice(data, '380', 'Invoice', extraNodes);
    return xml + `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(pdv)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(osnovica)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.formatAmount(pdv)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>${data.pdvStopa}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RSD">${this.formatAmount(data.iznosPrePopusta)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RSD">${this.formatAmount(osnovica)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RSD">${this.formatAmount(ukupno)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="RSD">${this.formatAmount(data.popustIznos)}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount(ukupno)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`.trim();
  }

  // 10. Faktura sa prilogom (380 AdditionalDocumentReference base64)
  static buildSaPrilogom(data: PrilogData) {
    const extraNodes = `  <cac:AdditionalDocumentReference>
    <cbc:ID>${data.prilogIme}</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="application/pdf" filename="${data.prilogIme}">${data.prilogBase64}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>`;
    const xml = this.buildBaseInvoice(data, '380', 'Invoice', extraNodes);
    return xml + `
  <cac:LegalMonetaryTotal>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount(data.ukupno)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`.trim();
  }

  // 11. Faktura sa valutom (380 strana valuta)
  static buildSaValutom(data: ValutaData) {
    const extraNodes = `  <cac:TaxExchangeRate>
    <cbc:SourceCurrencyCode>${data.valuta}</cbc:SourceCurrencyCode>
    <cbc:TargetCurrencyCode>RSD</cbc:TargetCurrencyCode>
    <cbc:CalculationRate>${data.kurs}</cbc:CalculationRate>
    <cbc:Date>${data.kursDatum}</cbc:Date>
  </cac:TaxExchangeRate>`;
    const xml = this.buildBaseInvoice(data, '380', 'Invoice', extraNodes);
    return xml + `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.pdvRSD)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(data.osnovicaRSD)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.pdvRSD)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>20</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:PayableAmount currencyID="${data.valuta}">${this.formatAmount(data.ukupnoValuta)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`.trim();
  }

  // 12. Faktura za javnu nabavku (380 BuyerReference CRF/JBKJS)
  static buildJavnaNabavka(data: JavnaNabavkaData) {
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
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount(data.iznos)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`.trim();
  }

  // 13. Standardna faktura (380)
  static buildStandardna(data: AvansData) {
    const ukupno = (data.osnovica || 0) + (data.pdv || 0);
    const xml = this.buildBaseInvoice(data, '380');
    return xml + `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.pdv)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RSD">${this.formatAmount(data.osnovica)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RSD">${this.formatAmount(data.pdv)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>20</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount(ukupno)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`.trim();
  }

  // 14. Fiskalizacija promet prodaja (380 sa PFR referencama)
  static buildFiskalizacijaProdaja(data: FiskalizacijaData) {
    let refs = '';
    for(const pfr of data.pfrBrojevi) {
      refs += `  <cac:AdditionalDocumentReference><cbc:ID>${pfr}</cbc:ID></cac:AdditionalDocumentReference>\n`;
    }
    const xml = this.buildBaseInvoice(data, '380', 'Invoice', refs);
    return xml + `
  <cac:LegalMonetaryTotal>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount(data.ukupno)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`.trim();
  }

  // 15. Fiskalizacija promet refundacija (381 sa PFR)
  static buildFiskalizacijaRefundacija(data: FiskalizacijaData) {
    let refs = '';
    for(const pfr of data.pfrBrojevi) {
      refs += `  <cac:AdditionalDocumentReference><cbc:ID>${pfr}</cbc:ID></cac:AdditionalDocumentReference>\n`;
    }
    const xml = this.buildBaseInvoice(data, '381', 'CreditNote', refs);
    return xml + `
  <cac:LegalMonetaryTotal>
    <cbc:PayableAmount currencyID="RSD">${this.formatAmount(data.ukupno)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</CreditNote>`.trim();
  }

  // 16. Konacna faktura sa valutom (380 zatvara avans u valuti)
  static buildKonacnaSaValutom(data: KonacnaValutaData) {
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
    <cbc:PrepaidAmount currencyID="${data.valuta}">${this.formatAmount(data.odbitakValuta)}</cbc:PrepaidAmount>
    <cbc:PayableAmount currencyID="${data.valuta}">${this.formatAmount(data.zaUplatuValuta)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`.trim();
  }

  /**
   * 17. ZBIRNA EVIDENCIJA OBRAČUNA (EEO PDV - Član 4)
   */
  static buildZbirniEeo(data: ZbirniEeoData) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<SummaryTaxEvidencis xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <PoreskiPeriod>${data.poreskiPeriod}</PoreskiPeriod>
  <OpstaStopa><Osnovica>${this.formatAmount(data.osnovica20)}</Osnovica><Pdv>${this.formatAmount(data.pdv20)}</Pdv></OpstaStopa>
  <PosebnaStopa><Osnovica>${this.formatAmount(data.osnovica10)}</Osnovica><Pdv>${this.formatAmount(data.pdv10)}</Pdv></PosebnaStopa>
  <OslobodjenBezPrava>${this.formatAmount(data.oslobodjenBezPrava || 0)}</OslobodjenBezPrava>
</SummaryTaxEvidencis>`.trim();
  }

  /**
   * 18. EVIDENCIJA PRETHODNOG POREZA (EPP)
   */
  static buildEpp(data: EppData) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<PrethodniPorezEvidencija xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <Period>${data.period}</Period>
  <NabavkeLokalne><Osnovica>${this.formatAmount(data.nabavkeOdObveznikaPdv)}</Osnovica><Porez>${this.formatAmount(data.prethodniPorezOdObveznika)}</Porez></NabavkeLokalne>
  <UvozRobe><Porez>${this.formatAmount(data.importPdvCarina)}</Porez></UvozRobe>
  <Gradevinarstvo><Porez>${this.formatAmount(data.gradevinarstvoPorez || 0)}</Porez></Gradevinarstvo>
</PrethodniPorezEvidencija>`.trim();
  }

  private static normalizeData(data: any) {
    // Čupamo podatke iz SefInvoiceData (ako postoje) u ravnu strukturu koju builderi očekuju
    if (data.broj === undefined) data.broj = data.ID;
    if (data.pibProdavca === undefined) data.pibProdavca = data.Supplier?.Pib || data.AccountingSupplierParty?.Party?.PartyTaxScheme?.cbc_CompanyID?.replace('RS', '');
    if (data.pibKupca === undefined) data.pibKupca = data.Customer?.Pib || data.AccountingCustomerParty?.Party?.PartyTaxScheme?.cbc_CompanyID?.replace('RS', '');
    
    // Čupanje osnovice i PDV-a iz LegalMonetaryTotal ili TaxTotals
    if (data.osnovica === undefined) {
       data.osnovica = data.LegalMonetaryTotal?.TaxExclusiveAmount || 0;
    }
    if (data.pdv === undefined) {
       data.pdv = data.TaxTotals?.[0]?.TaxAmount || (data.LegalMonetaryTotal ? (data.LegalMonetaryTotal.TaxInclusiveAmount - data.LegalMonetaryTotal.TaxExclusiveAmount) : 0);
    }

    if (data.ukupnaOsnovica === undefined) data.ukupnaOsnovica = data.osnovica;
    if (data.ukupniPdv === undefined) data.ukupniPdv = data.pdv;
    if (data.ukupno === undefined) data.ukupno = data.LegalMonetaryTotal?.PayableAmount || (data.osnovica + data.pdv);
    
    return data;
  }

  static build(data: any): string {
    const normalized = this.normalizeData({ ...data });
    const type = normalized.InvoiceTypeCode || normalized.TipZapisa || '380';
    switch (type) {
      case '386': return this.buildAvansni(normalized);
      case '381': return this.buildSmanjenje(normalized);
      case '383': return this.buildPovecanje(normalized);
      case 'EEO': return this.buildZbirniEeo(normalized);
      case 'EPP': return this.buildEpp(normalized);
      case '380':
      default:
        if (normalized.avansBroj) return this.buildKonacniSaAvansom(normalized);
        if (normalized.jbkjs) return this.buildJavnaNabavka(normalized);
        if (normalized.popustIznos) return this.buildSaPopustom(normalized);
        return this.buildStandardna(normalized);
    }
  }
}
