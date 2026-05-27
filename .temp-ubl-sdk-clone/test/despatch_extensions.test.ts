import { describe, it, expect } from 'vitest';
import { DespatchBuilder } from '../src/builder/DespatchBuilder.js';

describe('DespatchBuilder (eOtpremnica) - Serbian Extensions (SrbDtExt)', () => {
  it('should build a valid DespatchAdvice XML with shipment method and excise goods', () => {
    const xml = DespatchBuilder.create('OTP-EXT-001', '2026-05-24')
      .setSeller({
        pib: '111111111',
        name: 'PRODAVAC DOO',
        address: 'Adresa 1',
        city: 'Beograd'
      })
      .setBuyer({
        pib: '222222222',
        name: 'KUPAC DOO',
        address: 'Adresa 2',
        city: 'Novi Sad'
      })
      .setShipmentMethod('1') // Sopstveni prevoz
      .setIsReturn(true)
      .setOfflineZinNumber('ZIN-999')
      .addLine({
        id: '1',
        name: 'Dizel Gorivo',
        deliveredQuantity: 1000,
        unitCode: 'LTR',
        exciseCategory: 'NAFTA',
        itemProperties: {
          'GUSTINA': '0.840'
        }
      })
      .toXml();

    expect(xml).toContain('<cec:UBLExtensions>');
    expect(xml).toContain('<sbt:SrbDtExt');
    expect(xml).toContain('<sbt:ShipmentMethod><cbc:ShipmentMethodType>1</cbc:ShipmentMethodType></sbt:ShipmentMethod>');
    expect(xml).toContain('<sbt:GoodsReturn><cbc:Return>1</cbc:Return></sbt:GoodsReturn>');
    expect(xml).toContain('<sbt:OfflineZinNumber>ZIN-999</sbt:OfflineZinNumber>');
    expect(xml).toContain('<cbc:Name>AKCIZE.KATEGORIJA</cbc:Name><cbc:Value>NAFTA</cbc:Value>');
    expect(xml).toContain('<cbc:Name>GUSTINA</cbc:Name><cbc:Value>0.840</cbc:Value>');
  });

  it('should include DespatchAddress if provided', () => {
    const xml = DespatchBuilder.create('OTP-ADDR-001', '2026-05-24')
      .setSeller({ pib: '1', name: 'S' })
      .setBuyer({ pib: '2', name: 'B' })
      .setDespatchAddress({
        street: 'Magacinska 5',
        city: 'Inđija',
        zip: '22320',
        countryCode: 'RS'
      })
      .addLine({ id: '1', name: 'Test', deliveredQuantity: 1, unitCode: 'H87' })
      .toXml();

    expect(xml).toContain('<cac:DespatchAddress>');
    expect(xml).toContain('<cbc:StreetName>Magacinska 5</cbc:StreetName>');
    expect(xml).toContain('<cbc:CityName>Inđija</cbc:CityName>');
  });
});
