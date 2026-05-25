import { describe, it, expect } from 'vitest';
import { ReceiptBuilder } from '../src/builder/ReceiptBuilder.js';

describe('ReceiptBuilder (ePrijemnica) - Serbian Extensions (SrbDtExt)', () => {
  it('should build a valid ReceiptAdvice XML with discrepancy and shipment method', () => {
    const xml = ReceiptBuilder.create('REC-EXT-001', '2026-05-24')
      .setSeller({
        pib: '111111111',
        name: 'PRODAVAC DOO'
      })
      .setBuyer({
        pib: '222222222',
        name: 'KUPAC DOO'
      })
      .setDespatchReference('OTP-EXT-001', '2026-05-24')
      .setShipmentMethod('2') // Prevoznik
      .setIsReturn(false)
      .setFrameworkAgreementId('OS-123')
      .setContractId('UG-456')
      .addLine({
        id: '1',
        itemName: 'Cement 25kg',
        receivedQuantity: 90,
        shortQuantity: 10,
        unitCode: 'KGM',
        despatchLineReference: { id: '1' },
        exciseCategory: 'GRADJEVINSKI_MATERIJAL',
        itemProperties: { 'KVALITET': 'Premium' }
      })
      .toXml();

    expect(xml).toContain('<cec:UBLExtensions>');
    expect(xml).toContain('<sbt:SrbDtExt');
    expect(xml).toContain('<sbt:ShipmentMethod><cbc:ShipmentMethodType>2</cbc:ShipmentMethodType></sbt:ShipmentMethod>');
    expect(xml).toContain('<sbt:ExtDocuments>');
    expect(xml).toContain('<cac:OriginatorDocumentReference><cbc:ID>OS-123</cbc:ID></cac:OriginatorDocumentReference>');
    expect(xml).toContain('<cac:ContractDocumentReference><cbc:ID>UG-456</cbc:ID></cac:ContractDocumentReference>');
    expect(xml).toContain('<cac:DespatchDocumentReference>');
    expect(xml).toContain('<cbc:ReceivedQuantity unitCode="KGM">90</cbc:ReceivedQuantity>');
    expect(xml).toContain('<cbc:ShortQuantity unitCode="KGM">10</cbc:ShortQuantity>');
    expect(xml).toContain('<cac:DespatchLineReference><cbc:LineID>1</cbc:LineID></cac:DespatchLineReference>');
    expect(xml).toContain('<cbc:Name>AKCIZE.KATEGORIJA</cbc:Name><cbc:Value>GRADJEVINSKI_MATERIJAL</cbc:Value>');
    expect(xml).toContain('<cbc:Name>KVALITET</cbc:Name><cbc:Value>Premium</cbc:Value>');
  });
});
