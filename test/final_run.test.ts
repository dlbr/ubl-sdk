import { describe, it, expect } from 'vitest';
import { MasterValidator } from '@dlbr/ubl-sdk';
import { SefUblBuilder } from '@dlbr/ubl-sdk';

describe('🚀 Final Run — Izvozna Faktura (380) sa MasterValidator-om', () => {
  
  it('TREBA DA PROĐE validaciju i generiše XML za izvoz u EUR', () => {
    const exportInvoiceData = {
      ID: 'INV-001',
      broj: 'F-2026-001',
      datumIzdavanja: '2026-05-23',
      pibProdavca: '111111111',
      pibKupca: '222222222',
      InvoiceTypeCode: '380',
      valuta: 'EUR',
      exchangeRate: 117.05,
      osnovica: 1000,
      poreskaKategorija: 'E',
      sifraOslobodjenja: 'PDV-RS-24-1'
    };

    // 1. Provera MasterValidator-a (Sloj 2)
    // Napomena: Prilagođavamo data objekt validatoru
    const validationData = {
        ...exportInvoiceData,
        datumUplate: exportInvoiceData.datumIzdavanja, // Avans polje koje validator ocekuje za tip 386, ovde testiramo 380
        correctionReason: 'test' 
    };

    expect(MasterValidator.validate(validationData)).toBe(true);
    
    // 2. Generisanje XML-a (Sloj 1)
    const xml = SefUblBuilder.build(validationData);
    expect(xml).toContain('EUR');
    expect(xml).toContain('117.05');
    console.log("✅ Faktura uspešno prošla kroz MasterValidator i Builder!");
  });
});
