import { describe, it, expect, beforeAll, vi, afterAll } from 'vitest';
import { SefUblBuilder } from '../src/SefUblBuilder';

describe('🛡️ SEF Matrix XML Builder — Kompletan Poreski i XML Audit [POKRIVENOST 100%]', () => {

  beforeAll(() => {
    vi.setSystemTime(new Date('2026-05-26T12:00:00Z'));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  const getBaseData = (br: string) => ({
    invoiceNumber: br, 
    supplierPib: '101134702', 
    customerPib: '113398540',
    issueDate: '2026-05-26'
  });

  it('1. Avansna Faktura (386) sa obračunatim PDV-om', () => {
    const xml = SefUblBuilder.buildAvansni({
      ...getBaseData('AV-1'),
      taxableAmount: 1000, 
      taxAmount: 200,
      payableAmount: 1200,
      dueDate: '2026-05-26', 
      lines: [{ id: '1', name: 'Avans', quantity: 1, priceAmount: 1000, lineExtensionAmount: 1000, taxCategoryPercent: 20 }]
    });
    expect(xml).toContain('<cbc:InvoiceTypeCode>386</cbc:InvoiceTypeCode>');
    expect(xml).toContain('<cbc:ID>S</cbc:ID>');
    expect(xml).toContain('<cbc:Percent>20.00</cbc:Percent>');
    expect(xml).toContain('<cbc:TaxableAmount currencyID="RSD">1000.00</cbc:TaxableAmount>');
    expect(xml).toContain('<cbc:TaxAmount currencyID="RSD">200.00</cbc:TaxAmount>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="RSD">1200.00</cbc:PayableAmount>');
  });

  it('2. Konačna faktura sa delimičnim zatvaranjem avansa (380)', () => {
    const xml = SefUblBuilder.buildKonacniSaAvansom({
      ...getBaseData('KON-1'),
      taxableAmount: 1500, 
      taxAmount: 300, 
      payableAmount: 1200,
      prepaymentReference: { id: 'AV-1', prepaidAmount: 600 },
      lines: [
        { id: '1', name: 'Roba', quantity: 1, priceAmount: 2000, lineExtensionAmount: 2000, taxCategoryPercent: 20 },
        { id: '2', name: 'Odbitak avansa', quantity: -1, priceAmount: 500, lineExtensionAmount: -500, taxCategoryPercent: 20 }
      ]
    });
    expect(xml).toContain('<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>');
    expect(xml).toContain('<cac:InvoiceLine>');
    expect(xml).toContain('<cbc:TaxableAmount currencyID="RSD">1500.00</cbc:TaxableAmount>');
    expect(xml).toContain('<cbc:TaxAmount currencyID="RSD">300.00</cbc:TaxAmount>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="RSD">1800.00</cbc:PayableAmount>');
  });

  it('3. Knjižno Odobrenje / Smanjenje (381)', () => {
    const xml = SefUblBuilder.buildSmanjenje({
      ...getBaseData('STO-1'),
      billingReference: { id: 'KON-1', issueDate: '2026-05-25' },
      taxableAmount: 1000, 
      taxAmount: 200,
      payableAmount: 1200,
      documentDirection: 'POZITIVAN',
      lines: [{ id: '1', name: 'Greška u ceni', quantity: 1, priceAmount: 1000, lineExtensionAmount: 1000, taxCategoryPercent: 20 }]
    });
    expect(xml).toContain('<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="RSD">1200.00</cbc:PayableAmount>');
  });

  it('4. Knjižno Zaduženje / Povećanje (383)', () => {
    const xml = SefUblBuilder.buildPovecanje({
      ...getBaseData('ZAD-1'),
      billingReference: { id: 'KON-1', issueDate: '2026-05-25' },
      taxableAmount: 500, 
      taxAmount: 100,
      payableAmount: 600,
      lines: [{ id: '1', name: 'Povećanje', quantity: 1, priceAmount: 500, lineExtensionAmount: 500, taxCategoryPercent: 20 }]
    });
    expect(xml).toContain('<cbc:InvoiceTypeCode>383</cbc:InvoiceTypeCode>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="RSD">600.00</cbc:PayableAmount>');
  });

  it('7. Faktura sa oslobođenjem od PDV-a (380 TaxCategory E)', () => {
    const xml = SefUblBuilder.buildOslobodjena({
      ...getBaseData('OSL-1'),
      taxableAmount: 1000, 
      taxAmount: 0,
      payableAmount: 1000,
      lines: [{ id: '1', name: 'Usluge', quantity: 1, priceAmount: 1000, lineExtensionAmount: 1000, taxCategoryCode: 'E', taxCategoryPercent: 0, taxExemptionReasonCode: 'PDV-RS-24-1-1' }]
    });
    expect(xml).toContain('<cbc:ID>E</cbc:ID>');
    expect(xml).toContain('<cbc:TaxExemptionReasonCode>PDV-RS-24-1-1</cbc:TaxExemptionReasonCode>');
    expect(xml).toContain('<cbc:TaxAmount currencyID="RSD">0.00</cbc:TaxAmount>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="RSD">1000.00</cbc:PayableAmount>');
  });

  describe('📊 v3.8.0 Master Specifikacija Alignment Audit', () => {
    
    it('10. Poreska kategorija OE sa NEGATIVNIM smerom (Storno)', () => {
      const xml = SefUblBuilder.buildSmanjenje({
        ...getBaseData('STR-N-NEG'),
        billingReference: { id: 'INV-1', issueDate: '2026-05-25' },
        taxableAmount: -1000, 
        taxAmount: 0,
        payableAmount: -1000,
        documentDirection: 'NEGATIVAN',
        lines: [{ id: '1', name: 'Storno', quantity: -1, priceAmount: 1000, lineExtensionAmount: -1000, taxCategoryCode: 'OE', taxCategoryPercent: 0 }]
      });
      expect(xml).toContain('<cbc:ID>OE</cbc:ID>');
      expect(xml).toContain('<cbc:TaxAmount currencyID="RSD">0.00</cbc:TaxAmount>');
      expect(xml).toContain('<cbc:TaxableAmount currencyID="RSD">-1000.00</cbc:TaxableAmount>');
      expect(xml).toContain('<cbc:PayableAmount currencyID="RSD">-1000.00</cbc:PayableAmount>');
    });
  });
});