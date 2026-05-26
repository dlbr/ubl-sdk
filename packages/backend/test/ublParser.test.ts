import { describe, it, expect } from 'vitest';
import { SefUblParser } from '../src/ublParser';

describe('SefUblParser - Forensic Edge Hardening Tests', () => {
  const invoiceId = 'inv_test_forensic_999';

  it('Scenario 1: Treba uspešno da parsuje XML sa nestandardnim i promenjenim namespace prefiksima', () => {
    // SEF eksterni sistemi nekada koriste ns2, ns3 ili potpuno menjaju prefiks u korenu
    const dirtyXml = `
      <ns2:Invoice xmlns:ns2="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
        <cac:InvoiceLine>
          <cbc:ID>1</cbc:ID>
          <cbc:InvoicedQuantity unitCode="TNE">10.00</cbc:InvoicedQuantity>
          <cac:Item>
            <ns3:Name xmlns:ns3="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">Premium Beton-Blokovi</ns3:Name>
          </cac:Item>
          <cac:Price>
            <cbc:PriceAmount>1500.00</cbc:PriceAmount>
          </cac:Price>
          <cac:ItemPriceExtension>
            <cbc:LineExtensionAmount>15000.00</cbc:LineExtensionAmount>
          </cac:ItemPriceExtension>
          <cac:ClassifiedTaxCategory>
            <cbc:Percent>20.00</cbc:Percent>
            <cbc:TaxAmount>3000.00</cbc:TaxAmount>
          </cac:ClassifiedTaxCategory>
        </cac:InvoiceLine>
        <cac:TaxTotal>
          <cac:TaxSubtotal>
            <cbc:TaxableAmount>15000.00</cbc:TaxableAmount>
            <cbc:TaxAmount>3000.00</cbc:TaxAmount>
            <cac:TaxCategory>
              <cbc:ID>S</cbc:ID>
              <cbc:Percent>20.00</cbc:Percent>
            </cac:TaxCategory>
          </cac:TaxSubtotal>
        </cac:TaxTotal>
        <cac:LegalMonetaryTotal>
          <cbc:LineExtensionAmount>15000.00</cbc:LineExtensionAmount>
          <cbc:TaxExclusiveAmount>15000.00</cbc:TaxExclusiveAmount>
          <cbc:TaxInclusiveAmount>18000.00</cbc:TaxInclusiveAmount>
          <cbc:PayableAmount>18000.00</cbc:PayableAmount>
        </cac:LegalMonetaryTotal>
      </ns2:Invoice>
    `;

    const result = SefUblParser.extract(dirtyXml, invoiceId);

    expect(result.invoiceId).toBe(invoiceId);
    expect(result.items).toHaveLength(1);
    expect(result.items?.[0]?.itemName).toBe('Premium Beton-Blokovi');
    expect(result.items?.[0]?.unitCode).toBe('TNE'); // Provera da li je zadržana tona umesto fallback šifre
    expect(result.items?.[0]?.lineExtensionAmount).toBe(15000.00);
    expect(result.taxes?.[0]?.taxCategoryCode).toBe('S');
  });

  it('Scenario 2: Treba da izoluje root poreze od poreza na nivou stavke i ignorise prljave razmake i navodnike u atributima', () => {
    // Razmaci unutar tagova i jednostruki navodnici slomili bi naivan regex
    const malformedAttributesXml = `
      <Invoice>
        <cac:InvoiceLine>
          <cbc:InvoicedQuantity    unitCode='KGM'   >500</cbc:InvoicedQuantity>
          <cac:Item>
            <cbc:Name>Sirovina X</cbc:Name>
          </cac:Item>
          <cbc:LineExtensionAmount>2500.00</cbc:LineExtensionAmount>
          <cac:ClassifiedTaxCategory>
            <cbc:Percent>10.00</cbc:Percent>
            <cbc:TaxAmount>250.00</cbc:TaxAmount>
          </cac:ClassifiedTaxCategory>
        </cac:InvoiceLine>
        <cac:TaxTotal>
          <cac:TaxSubtotal>
            <cbc:TaxableAmount>2500.00</cbc:TaxableAmount>
            <cbc:TaxAmount>250.00</cbc:TaxAmount>
            <cac:TaxCategory>
              <cbc:ID>AE</cbc:ID>
              <cbc:Percent>10.00</cbc:Percent>
            </cac:TaxCategory>
          </cac:TaxSubtotal>
        </cac:TaxTotal>
        <cac:LegalMonetaryTotal></cac:LegalMonetaryTotal>
      </Invoice>
    `;

    const result = SefUblParser.extract(malformedAttributesXml, invoiceId);

    expect(result.items?.[0]?.unitCode).toBe('KGM'); // Kilogrami uspešno mapirani uprkos tabulatorima i jednostrukim navodnicima
    expect(result.taxes).toHaveLength(1);
    expect(result.taxes?.[0]?.taxCategoryCode).toBe('AE'); // Provera poreza na nivou celog dokumenta (Reverzibilna obaveza)
    expect(result.taxes?.[0]?.taxAmount).toBe(250.00);
  });

  it('Scenario 3: Treba da baci kontrolisanu grešku ako Valibot presretne nevalidne tipove podataka u XML-u', () => {
    // Ako SEF vrati korumpiran podatak (npr. tekst umesto broja za iznos), Valibot to mora da presretne na ivici pre upisa u SQLite
    const corruptedDataXml = `
      <Invoice>
        <cac:InvoiceLine>
          <cbc:InvoicedQuantity>1</cbc:InvoicedQuantity>
          <cac:Item>
            <cbc:Name>Stavka sa fatalnom greškom</cbc:Name>
          </cac:Item>
          <cbc:LineExtensionAmount>KORUMPIRAN_TEKST_UMESTO_BROJA</cbc:LineExtensionAmount>
        </cac:InvoiceLine>
        <cac:TaxTotal>
          <cac:TaxSubtotal>
            <cbc:TaxableAmount>0.00</cbc:TaxableAmount>
          </cac:TaxSubtotal>
        </cac:TaxTotal>
        <cac:LegalMonetaryTotal></cac:LegalMonetaryTotal>
      </Invoice>
    `;

    // Očekujemo da safeParse unutar parsera ne prođe i baci grešku koja štiti SQLite od zagađenja podataka
    expect(() => SefUblParser.extract(corruptedDataXml, invoiceId)).toThrowError(
      /UBL Forensic Match Failure/
    );
  });
});
