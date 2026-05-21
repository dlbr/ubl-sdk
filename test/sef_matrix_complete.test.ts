import { describe, it, expect } from 'vitest';
import { SefMatrixXmlBuilder } from '../worker/sef_matrix_xml_builder';

describe('SEF Matrix XML Builder — Kompletan Poreski i XML Audit', () => {

  it('1. Avansna Faktura (386) sa obračunatim PDV-om', () => {
    const xml = SefMatrixXmlBuilder.buildAvansni({
      broj: 'AV-1', pibProdavca: '100000001', pibKupca: '200000002', osnovica: 1000, pdv: 200
    });
    expect(xml).toContain('<cbc:InvoiceTypeCode>386</cbc:InvoiceTypeCode>');
    expect(xml).toContain('<cbc:TaxableAmount currencyID="RSD">1000.00</cbc:TaxableAmount>');
    expect(xml).toContain('<cbc:TaxAmount currencyID="RSD">200.00</cbc:TaxAmount>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="RSD">1200.00</cbc:PayableAmount>');
  });

  it('2. Konačna faktura sa zatvaranjem avansa (380)', () => {
    const xml = SefMatrixXmlBuilder.buildKonacniSaAvansom({
      broj: 'KON-1', pibProdavca: '100000001', pibKupca: '200000002',
      avansBroj: 'AV-1', avansDatum: '2026-05-21',
      ukupnaOsnovica: 2000, ukupniPdv: 400, odbitakAvansaSaPdv: 1200
    });
    expect(xml).toContain('<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>');
    expect(xml).toContain('<cac:BillingReference>');
    expect(xml).toContain('<cbc:ID>AV-1</cbc:ID>');
    expect(xml).toContain('<cbc:PrepaidAmount currencyID="RSD">1200.00</cbc:PrepaidAmount>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="RSD">1200.00</cbc:PayableAmount>'); // 2400 - 1200
  });

  it('3. Knjižno Odobrenje / Storno (381)', () => {
    const xml = SefMatrixXmlBuilder.buildSmanjenje({
      broj: 'STO-1', pibProdavca: '100000001', pibKupca: '200000002',
      referentniRacun: 'KON-1', razlog: 'Greška u ceni',
      iznosZaSmanjenjeOsnovice: 1000, iznosZaSmanjenjePdv: 200
    });
    expect(xml).toContain('<CreditNote');
    expect(xml).toContain('<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>');
    expect(xml).toContain('<cbc:ID>KON-1</cbc:ID>');
    expect(xml).toContain('<cbc:DocumentDescription>Greška u ceni</cbc:DocumentDescription>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="RSD">1200.00</cbc:PayableAmount>');
  });

  it('4. Knjižno Zaduženje / Povećanje (383)', () => {
    const xml = SefMatrixXmlBuilder.buildPovecanje({
      broj: 'ZAD-1', pibProdavca: '100000001', pibKupca: '200000002',
      referentniRacun: 'KON-1', datumReferentnog: '2026-05-21',
      iznosZaPovecanjeOsnovice: 500, iznosZaPovecanjePdv: 100
    });
    expect(xml).toContain('<cbc:InvoiceTypeCode>383</cbc:InvoiceTypeCode>');
    expect(xml).toContain('<cac:BillingReference>');
    expect(xml).toContain('<cbc:ID>KON-1</cbc:ID>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="RSD">600.00</cbc:PayableAmount>');
  });

  it('8. Faktura sa oslobođenjem od PDV-a (380 TaxCategory E/O/AE)', () => {
    const xml = SefMatrixXmlBuilder.buildOslobodjena({
      broj: 'OSL-1', pibProdavca: '100000001', pibKupca: '200000002',
      iznos: 1000, poreskaKategorija: 'E', sifraOslobodjenja: 'PDV-RS-24-1-1'
    });
    expect(xml).toContain('<cbc:ID>E</cbc:ID>');
    expect(xml).toContain('<cbc:TaxExemptionReasonCode>PDV-RS-24-1-1</cbc:TaxExemptionReasonCode>');
    expect(xml).toContain('<cbc:TaxExemptionReason>Oslobođeno plaćanja PDV-a po članu 24. stav 1. tačka 1. Zakona o PDV</cbc:TaxExemptionReason>');
    expect(xml).toContain('<cbc:TaxAmount currencyID="RSD">0.00</cbc:TaxAmount>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="RSD">1000.00</cbc:PayableAmount>');
  });

  it('9. Faktura sa popustom (380 AllowanceCharge)', () => {
    const xml = SefMatrixXmlBuilder.buildSaPopustom({
      broj: 'POP-1', pibProdavca: '100000001', pibKupca: '200000002',
      iznosPrePopusta: 1000, popustIznos: 100, pdvStopa: 20
    });
    expect(xml).toContain('<cac:AllowanceCharge>');
    expect(xml).toContain('<cbc:ChargeIndicator>false</cbc:ChargeIndicator>');
    expect(xml).toContain('<cbc:Amount currencyID="RSD">100.00</cbc:Amount>');
    expect(xml).toContain('<cbc:TaxableAmount currencyID="RSD">900.00</cbc:TaxableAmount>');
    expect(xml).toContain('<cbc:TaxAmount currencyID="RSD">180.00</cbc:TaxAmount>');
    expect(xml).toContain('<cbc:AllowanceTotalAmount currencyID="RSD">100.00</cbc:AllowanceTotalAmount>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="RSD">1080.00</cbc:PayableAmount>');
  });

  it('10. Faktura sa prilogom (380 AdditionalDocumentReference base64)', () => {
    const xml = SefMatrixXmlBuilder.buildSaPrilogom({
      broj: 'PRI-1', pibProdavca: '100000001', pibKupca: '200000002',
      ukupno: 1000, prilogIme: 'ugovor.pdf', prilogBase64: 'JVBERi0xLjQK'
    });
    expect(xml).toContain('<cac:AdditionalDocumentReference>');
    expect(xml).toContain('<cbc:EmbeddedDocumentBinaryObject mimeCode="application/pdf" filename="ugovor.pdf">JVBERi0xLjQK</cbc:EmbeddedDocumentBinaryObject>');
  });

  it('11. Faktura sa valutom (380 strana valuta)', () => {
    const xml = SefMatrixXmlBuilder.buildSaValutom({
      broj: 'VAL-1', pibProdavca: '100000001', pibKupca: '200000002',
      valuta: 'EUR', kurs: 117.2, kursDatum: '2026-05-21',
      osnovicaRSD: 11720, pdvRSD: 2344, ukupnoValuta: 120
    });
    expect(xml).toContain('<cac:TaxExchangeRate>');
    expect(xml).toContain('<cbc:SourceCurrencyCode>EUR</cbc:SourceCurrencyCode>');
    expect(xml).toContain('<cbc:TargetCurrencyCode>RSD</cbc:TargetCurrencyCode>');
    expect(xml).toContain('<cbc:CalculationRate>117.2</cbc:CalculationRate>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="EUR">120.00</cbc:PayableAmount>');
  });

  it('12. Faktura za javnu nabavku (CRF i JBKJS)', () => {
    const xml = SefMatrixXmlBuilder.buildJavnaNabavka({
      broj: 'JN-1', pibProdavca: '100000001', pibKupca: '200000002',
      iznos: 5000, brojUgovora: 'UG-123', jbkjs: '12345'
    });
    expect(xml).toContain('<cbc:BuyerReference>JN-JBKJS:12345</cbc:BuyerReference>');
    expect(xml).toContain('<cac:OrderReference>');
    expect(xml).toContain('<cbc:ID>UG-123</cbc:ID>');
    expect(xml).toContain('<cbc:ID>JBKJS:12345</cbc:ID>');
  });

  it('13. Standardna faktura (380)', () => {
    const xml = SefMatrixXmlBuilder.buildStandardna({
      broj: 'STD-1', pibProdavca: '100000001', pibKupca: '200000002',
      osnovica: 1000, pdv: 200
    });
    expect(xml).toContain('<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="RSD">1200.00</cbc:PayableAmount>');
  });

  it('14. Fiskalizacija promet prodaja (380 sa PFR referencama)', () => {
    const xml = SefMatrixXmlBuilder.buildFiskalizacijaProdaja({
      broj: 'FIS-1', pibProdavca: '100000001', pibKupca: '200000002',
      ukupno: 1000, pfrBrojevi: ['PFR-111', 'PFR-222']
    });
    expect(xml).toContain('<cac:AdditionalDocumentReference><cbc:ID>PFR-111</cbc:ID></cac:AdditionalDocumentReference>');
    expect(xml).toContain('<cac:AdditionalDocumentReference><cbc:ID>PFR-222</cbc:ID></cac:AdditionalDocumentReference>');
  });

  it('15. Fiskalizacija promet refundacija (381 sa PFR)', () => {
    const xml = SefMatrixXmlBuilder.buildFiskalizacijaRefundacija({
      broj: 'REF-1', pibProdavca: '100000001', pibKupca: '200000002',
      ukupno: 1000, pfrBrojevi: ['PFR-333']
    });
    expect(xml).toContain('<CreditNote');
    expect(xml).toContain('<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>');
    expect(xml).toContain('<cac:AdditionalDocumentReference><cbc:ID>PFR-333</cbc:ID></cac:AdditionalDocumentReference>');
  });

  it('16. Konacna faktura sa valutom (380 zatvara avans u valuti)', () => {
    const xml = SefMatrixXmlBuilder.buildKonacnaSaValutom({
      broj: 'KVAL-1', pibProdavca: '100000001', pibKupca: '200000002',
      avansBroj: 'AV-EUR-1', valuta: 'EUR', kurs: 117.2,
      odbitakValuta: 100, zaUplatuValuta: 20
    });
    expect(xml).toContain('<cac:BillingReference>');
    expect(xml).toContain('<cbc:ID>AV-EUR-1</cbc:ID>');
    expect(xml).toContain('<cac:TaxExchangeRate>');
    expect(xml).toContain('<cbc:PrepaidAmount currencyID="EUR">100.00</cbc:PrepaidAmount>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="EUR">20.00</cbc:PayableAmount>');
  });

  it('17. Dokument o smanjenju po osnovu smanjenja avansa (381 sa SrbDtExt)', () => {
    const xml = SefMatrixXmlBuilder.buildSmanjenjeAvansa({
      broj: 'SMAV-1', pibProdavca: '100000001', pibKupca: '200000002',
      avansBroj: 'AV-1', avansDatum: '2026-05-21',
      iznosSmanjenjaOsnovice: 500, iznosSmanjenjaPdv: 100
    });
    expect(xml).toContain('<cec:UBLExtensions>');
    expect(xml).toContain('<sbt:InvoicedPrepaymentAmount>');
    expect(xml).toContain('<sbt:ReducedTotals>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="RSD">0.00</cbc:PayableAmount>'); // Zahtev SEF-a
  });

  it('18. Dokument o smanjenju u periodu (381 InvoicePeriod)', () => {
    const xml = SefMatrixXmlBuilder.buildSmanjenjeUPeriodu({
      broj: 'SMPER-1', pibProdavca: '100000001', pibKupca: '200000002',
      periodOd: '2026-01-01', periodDo: '2026-03-31', opisKod: '35',
      iznosZaSmanjenjeOsnovice: 1000, iznosZaSmanjenjePdv: 200
    });
    expect(xml).toContain('<cac:InvoicePeriod>');
    expect(xml).toContain('<cbc:StartDate>2026-01-01</cbc:StartDate>');
    expect(xml).toContain('<cbc:EndDate>2026-03-31</cbc:EndDate>');
    expect(xml).toContain('<cbc:DescriptionCode>35</cbc:DescriptionCode>');
  });

  it('19. Dokument o smanjenju za vise faktura (381 Multiple BillingReferences)', () => {
    const xml = SefMatrixXmlBuilder.buildSmanjenjeViseFaktura({
      broj: 'SMVIS-1', pibProdavca: '100000001', pibKupca: '200000002',
      fakture: [
        { id: 'FAK-1', datum: '2026-04-01' },
        { id: 'FAK-2', datum: '2026-04-15' }
      ],
      iznosZaSmanjenjeOsnovice: 1000, iznosZaSmanjenjePdv: 200
    });
    expect(xml).toContain('<cbc:ID>FAK-1</cbc:ID>');
    expect(xml).toContain('<cbc:ID>FAK-2</cbc:ID>');
    // Brojimo occurrence BillingReference
    const count = (xml.match(/<cac:BillingReference>/g) || []).length;
    expect(count).toBe(2);
  });
});
