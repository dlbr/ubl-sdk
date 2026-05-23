import { describe, it, expect } from 'vitest';
import { SefUblBuilder } from '../packages/sef-ubl-builder/src/index';

describe('🛡️ Digitalni Štit — Stress Test Poligon', () => {
  
  it('TREBA DA ODBIJE fakturu sa negativnim iznosom', () => {
    const data = { 
        ID: 'TEST-NEG-1',
        broj: 'F-1',
        datumIzdavanja: '2026-05-23',
        pibProdavca: '111111111',
        pibKupca: '222222222',
        InvoiceTypeCode: '380',
        LegalMonetaryTotal: { PayableAmount: -100 }
    };
    expect(() => SefUblBuilder.build(data as any)).toThrow();
  });

  it('TREBA DA VALIDIRA PIB primaoca (Strukturalna zaštita)', () => {
    const invalidPib = '123'; 
    expect(() => SefUblBuilder.validatePib(invalidPib)).toThrow();
  });

  it('TREBA DA DETEKTUJE pogrešnu kombinaciju Poreske kategorije i stope', () => {
    const data = { 
        ID: 'TEST-TAX-1',
        broj: 'F-2',
        datumIzdavanja: '2026-05-23',
        pibProdavca: '111111111',
        pibKupca: '222222222',
        InvoiceTypeCode: '380',
        LegalMonetaryTotal: { PayableAmount: 100 },
        TaxTotals: [{
            Subtotals: [{ Category: 'S20', Percent: 5.0, TaxableAmount: 100, TaxAmount: 5 }]
        }]
    };
    expect(() => SefUblBuilder.build(data as any)).toThrow();
  });

  it('TREBA DA ODBIJE fakturu bez obaveznih polja', () => {
    const incompleteData = { ID: 'TEST-EMPTY' };
    expect(() => SefUblBuilder.build(incompleteData as any)).toThrow();
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
    expect(() => SefUblBuilder.build(avansData as any)).toThrow('[Shield-386]');
  });
});
