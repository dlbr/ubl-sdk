import { describe, it, expect } from 'vitest';
import { SefUblBuilder, MasterValidator } from '@dlbr/ubl-sdk';

describe('🛡️ Digitalni Štit — Stress Test Poligon', () => {
  
  it('TREBA DA ODBIJE fakturu sa negativnim iznosom', () => {
    const data = { 
        ID: 'TEST-NEG-1',
        broj: 'F-1',
        datumIzdavanja: '2026-05-23',
        pibProdavca: '111111111',
        pibKupca: '222222222',
        InvoiceTypeCode: '380',
        osnovica: -100
    };
    expect(() => SefUblBuilder.build(data as any)).toThrow('Iznos ne može biti negativan');
  });

  it('TREBA DA ODBIJE fakturu sa nevalidnim PIB-om', () => {
    const data = { 
        ID: 'TEST-PIB-1',
        broj: 'F-1',
        datumIzdavanja: '2026-05-23',
        pibProdavca: '111111111',
        pibKupca: 'ABCDEFGHI', // Invalid non-numeric
        InvoiceTypeCode: '380',
        osnovica: 100
    };
    expect(() => SefUblBuilder.build(data as any)).toThrow('PIB mora imati 9 cifara');
  });

  it('TREBA DA ODBIJE fakturu bez obaveznih polja', () => {
    const incompleteData = { ID: 'TEST-EMPTY' };
    expect(() => SefUblBuilder.build(incompleteData as any)).toThrow('Nedostaju obavezna polja');
  });

  it('TREBA DA ODBIJE avansni račun (386) bez datuma uplate', () => {
    const avansData = { 
        ID: 'AV-001',
        broj: 'AV-001',
        datumIzdavanja: '2026-05-23',
        pibProdavca: '111111111',
        pibKupca: '222222222',
        InvoiceTypeCode: '386',
        osnovica: 100
    };
    expect(() => SefUblBuilder.build(avansData as any)).toThrow('Avans zahteva datum uplate');
  });
});
