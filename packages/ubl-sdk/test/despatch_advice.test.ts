import { describe, it, expect } from 'vitest';
import { DespatchBuilder } from '../src/builder/DespatchBuilder.js';

describe('DespatchBuilder (eOtpremnica) - UBL 2.1 Audit', () => {
  it('should build a valid DespatchAdvice XML', () => {
    const xml = DespatchBuilder.create('OTP-2026-001', '2026-05-24')
      .setSeller({
        pib: '123456789',
        name: 'PRODAVAC DOO',
        address: 'Nemanjina 1',
        city: 'Beograd'
      })
      .setBuyer({
        pib: '987654321',
        name: 'KUPAC DOO',
        address: 'Bulevar Oslobođenja 10',
        city: 'Novi Sad'
      })
      .addLine({
        id: '1',
        name: 'Cement 25kg',
        deliveredQuantity: 100,
        unitCode: 'KGM',
        itemID: 'ITEM-123'
      })
      .addNote('Isporučiti posle 10h')
      .toXml();

    expect(xml).toContain('<DespatchAdvice');
    expect(xml).toContain('<cbc:ID>OTP-2026-001</cbc:ID>');
    expect(xml).toContain('<cbc:Note>Isporučiti posle 10h</cbc:Note>');
    expect(xml).toContain('<cbc:DeliveredQuantity unitCode="KGM">100</cbc:DeliveredQuantity>');
    expect(xml).toContain('<cbc:Name>Cement 25kg</cbc:Name>');
    expect(xml).toContain('xmlns="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2"');
  });
});
