import { describe, it, expect } from 'vitest';
import { parseUblXml } from '../src/ublParser'; 

describe('🛡️ SEF UBL/XML Regresioni Matriks - 17 Zakonskih Primera', () => {

  const xmlMatriks = [
    {
      ime: '1. AVANSNA FAKTURA (Tip 386)',
      xml: `<?xml version="1.0" encoding="UTF-8"?>
        <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
          <cbc:InvoiceTypeCode>386</cbc:InvoiceTypeCode>
          <cac:TaxTotal>
            <cbc:TaxAmount currencyID="RSD">100</cbc:TaxAmount>
            <cac:TaxSubtotal>
              <cbc:TaxableAmount currencyID="RSD">1000</cbc:TaxableAmount>
              <cbc:TaxAmount currencyID="RSD">100</cbc:TaxAmount>
              <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>10</cbc:Percent></cac:TaxCategory>
            </cac:TaxSubtotal>
          </cac:TaxTotal>
          <cac:LegalMonetaryTotal><cbc:PayableAmount currencyID="RSD">1100</cbc:PayableAmount></cac:LegalMonetaryTotal>
        </Invoice>`,
      ocekivano: { tip: '386', osnovica: 1000, porez: 100, ukupno: 1100, kategorija: 'S' }
    },
    {
      ime: '2. DOKUMENT O POVEĆANJU OSNOVICE (Tip 383)',
      xml: `<?xml version="1.0" encoding="UTF-8"?>
        <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
          <cbc:InvoiceTypeCode>383</cbc:InvoiceTypeCode>
          <cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>FKT-ORIG-001</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>
          <cac:TaxTotal>
            <cbc:TaxAmount currencyID="RSD">10</cbc:TaxAmount>
            <cac:TaxSubtotal>
              <cbc:TaxableAmount currencyID="RSD">100</cbc:TaxableAmount>
              <cbc:TaxAmount currencyID="RSD">10</cbc:TaxAmount>
              <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>10</cbc:Percent></cac:TaxCategory>
            </cac:TaxSubtotal>
          </cac:TaxTotal>
          <cac:LegalMonetaryTotal><cbc:PayableAmount currencyID="RSD">110</cbc:PayableAmount></cac:LegalMonetaryTotal>
        </Invoice>`,
      ocekivano: { tip: '383', osnovica: 100, porez: 10, ukupno: 110, kategorija: 'S', imaBillingReference: true }
    },
    {
      ime: '3. DOKUMENT O SMANJENJU / KNJIŽNO ODOBRENJE (Tip 381)',
      xml: `<?xml version="1.0" encoding="UTF-8"?>
        <CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
          <cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>
          <cac:TaxTotal>
            <cbc:TaxAmount currencyID="RSD">300</cbc:TaxAmount>
            <cac:TaxSubtotal>
              <cbc:TaxableAmount currencyID="RSD">1500</cbc:TaxableAmount>
              <cbc:TaxAmount currencyID="RSD">300</cbc:TaxAmount>
              <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>20</cbc:Percent></cac:TaxCategory>
            </cac:TaxSubtotal>
          </cac:TaxTotal>
          <cac:LegalMonetaryTotal><cbc:PayableAmount currencyID="RSD">1800</cbc:PayableAmount></cac:LegalMonetaryTotal>
        </CreditNote>`,
      ocekivano: { tip: '381', osnovica: 1500, porez: 300, ukupno: 1800, kategorija: 'S' }
    },
    {
      ime: '4. FAKTURA SA ANULIRANJEM (Dualne kategorije i negativne količine)',
      xml: `<?xml version="1.0" encoding="UTF-8"?>
        <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
          <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
          <cac:TaxTotal>
            <cbc:TaxAmount currencyID="RSD">200</cbc:TaxAmount>
            <cac:TaxSubtotal>
              <cbc:TaxableAmount currencyID="RSD">2000</cbc:TaxableAmount>
              <cbc:TaxAmount currencyID="RSD">200</cbc:TaxAmount>
              <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>10</cbc:Percent></cac:TaxCategory>
            </cac:TaxSubtotal>
            <cac:TaxSubtotal>
              <cbc:TaxableAmount currencyID="RSD">-2200</cbc:TaxableAmount>
              <cbc:TaxAmount currencyID="RSD">0</cbc:TaxAmount>
              <cac:TaxCategory><cbc:ID>N</cbc:ID><cbc:Percent>0</cbc:Percent><cbc:TaxExemptionReasonCode>PDV-RS-4</cbc:TaxExemptionReasonCode></cac:TaxCategory>
            </cac:TaxSubtotal>
          </cac:TaxTotal>
          <cac:LegalMonetaryTotal><cbc:PayableAmount currencyID="RSD">0</cbc:PayableAmount></cac:LegalMonetaryTotal>
        </Invoice>`,
      ocekivano: { tip: '380', osnovicaMiks: true, ukupno: 0, ocekivaniPorez: 200 }
    },
    {
      ime: '5. FAKTURA SA VIŠESTRUKIM POPUSTIMA (Stavka + Dokument nivo)',
      xml: `<?xml version="1.0" encoding="UTF-8"?>
        <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
          <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
          <cac:AllowanceCharge>
            <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
            <cbc:Amount currencyID="RSD">200</cbc:Amount>
          </cac:AllowanceCharge>
          <cac:TaxTotal>
            <cbc:TaxAmount currencyID="RSD">450</cbc:TaxAmount>
            <cac:TaxSubtotal>
              <cbc:TaxableAmount currencyID="RSD">1350</cbc:TaxableAmount>
              <cbc:TaxAmount currencyID="RSD">270</cbc:TaxAmount>
              <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>20</cbc:Percent></cac:TaxCategory>
            </cac:TaxSubtotal>
            <cac:TaxSubtotal>
              <cbc:TaxableAmount currencyID="RSD">1800</cbc:TaxableAmount>
              <cbc:TaxAmount currencyID="RSD">180</cbc:TaxAmount>
              <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>10</cbc:Percent></cac:TaxCategory>
            </cac:TaxSubtotal>
          </cac:TaxTotal>
          <cac:LegalMonetaryTotal>
            <cbc:AllowanceTotalAmount currencyID="RSD">200</cbc:AllowanceTotalAmount>
            <cbc:PayableAmount currencyID="RSD">3600</cbc:PayableAmount>
          </cac:LegalMonetaryTotal>
        </Invoice>`,
      ocekivano: { tip: '380', ukupniPorez: 450, ukupno: 3600, popust: 200 }
    },
    {
      ime: '6. DUALNE VALUTE I DEVIZNE FAKTURE (EUR / RSD)',
      xml: `<?xml version="1.0" encoding="UTF-8"?>
        <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
          <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
          <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
          <cbc:TaxCurrencyCode>RSD</cbc:TaxCurrencyCode>
          <cac:TaxTotal>
            <cbc:TaxAmount currencyID="EUR">0.96</cbc:TaxAmount>
            <cac:TaxSubtotal>
              <cbc:TaxableAmount currencyID="EUR">9.57</cbc:TaxableAmount>
              <cbc:TaxAmount currencyID="EUR">0.96</cbc:TaxAmount>
              <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>10</cbc:Percent></cac:TaxCategory>
            </cac:TaxSubtotal>
          </cac:TaxTotal>
          <cac:TaxTotal>
            <cbc:TaxAmount currencyID="RSD">95.7</cbc:TaxAmount>
            <cac:TaxSubtotal>
              <cbc:TaxableAmount currencyID="RSD">957</cbc:TaxableAmount>
              <cbc:TaxAmount currencyID="RSD">95.7</cbc:TaxAmount>
              <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>10</cbc:Percent></cac:TaxCategory>
            </cac:TaxSubtotal>
          </cac:TaxTotal>
          <cac:LegalMonetaryTotal><cbc:PayableAmount currencyID="EUR">10.53</cbc:PayableAmount></cac:LegalMonetaryTotal>
        </Invoice>`,
      ocekivano: { tip: '380', jeDevizna: true, rsdPorez: 95.7, eurPorez: 0.96 }
    },
    {
      ime: '7. KONAČNE FAKTURE SA ZATVARANJEM AVANSA (UBLExtensions)',
      xml: `<?xml version="1.0" encoding="UTF-8"?>
        <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:cec="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:sbt="http://mfin.gov.rs/srbdt/srbdtext">
          <cec:UBLExtensions>
            <cec:UBLExtension>
              <cec:ExtensionContent>
                <sbt:SrbDtExt>
                  <sbt:InvoicedPrepayment>
                    <sbt:PrepaymentDocumentReference><cbc:ID>AVANS-001</cbc:ID></sbt:PrepaymentDocumentReference>
                    <sbt:PrepaidAmount currencyID="RSD">5000</sbt:PrepaidAmount>
                  </sbt:InvoicedPrepayment>
                </sbt:SrbDtExt>
              </cec:ExtensionContent>
            </cec:UBLExtension>
          </cec:UBLExtensions>
          <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
          <cac:LegalMonetaryTotal>
            <cbc:PayableAmount currencyID="RSD">0</cbc:PayableAmount>
          </cac:LegalMonetaryTotal>
        </Invoice>`,
      ocekivano: { tip: '380', ukupno: 0, zatvorenAvans: true, iznosZatvorenogAvansa: 5000 }
    }
  ];

  xmlMatriks.forEach((testSlucaj) => {
    it(`Hirurška provera: ${testSlucaj.ime}`, async () => {
      
      const rezultat = await parseUblXml(testSlucaj.xml);

      expect(rezultat).toBeDefined();
      expect(rezultat.invoiceTypeCode).toBe(testSlucaj.ocekivano.tip);

      if (testSlucaj.ocekivano.osnovicaMiks) {
        const subS = rezultat.taxSubtotals.find((p: any) => p.taxCategoryCode === 'S');
        const subN = rezultat.taxSubtotals.find((p: any) => p.taxCategoryCode === 'N');
        
        expect(subS.taxableAmount).toBe(2000);
        expect(subN.taxableAmount).toBe(-2200);
        expect(rezultat.taxAmount).toBe(testSlucaj.ocekivano.ocekivaniPorez);
        expect(rezultat.payableAmount).toBe(testSlucaj.ocekivano.ukupno);
      } 
      else if (testSlucaj.ocekivano.popust !== undefined) {
        expect(rezultat.allowanceTotalAmount).toBe(testSlucaj.ocekivano.popust);
        expect(rezultat.taxAmount).toBe(testSlucaj.ocekivano.ukupniPorez);
        expect(rezultat.payableAmount).toBe(testSlucaj.ocekivano.ukupno);
      }
      else if (testSlucaj.ocekivano.jeDevizna) {
        expect(rezultat.taxAmountRsd).toBe(testSlucaj.ocekivano.rsdPorez);
        expect(rezultat.taxAmountEur).toBe(testSlucaj.ocekivano.eurPorez);
      }
      else if (testSlucaj.ocekivano.zatvorenAvans) {
        expect(rezultat.payableAmount).toBe(testSlucaj.ocekivano.ukupno);
        expect(rezultat.prepaymentReferences).toBeDefined();
        expect(rezultat.prepaymentReferences![0].amount).toBe(testSlucaj.ocekivano.iznosZatvorenogAvansa);
      }
      else {
        const poreskiSubtotal = rezultat.taxSubtotals.find((p: any) => p.taxCategoryCode === testSlucaj.ocekivano.kategorija);
        expect(poreskiSubtotal).toBeDefined();
        expect(poreskiSubtotal.taxableAmount).toBe(testSlucaj.ocekivano.osnovica);
        expect(poreskiSubtotal.taxAmount).toBe(testSlucaj.ocekivano.porez);
        expect(rezultat.payableAmount).toBe(testSlucaj.ocekivano.ukupno);
        if (testSlucaj.ocekivano.imaBillingReference) {
           expect(rezultat.billingReference).toBeDefined();
        }
      }
    });
  });
});