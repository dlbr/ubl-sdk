import { describe, it, expect } from 'vitest';
import { MasterValidator } from '@dlbr/ubl-sdk';

describe('🛡️ B2G (Business-to-Government) Compliance Validation', () => {

  const validB2GPayload = {
    id: 'B2G-INV-2026-0001',
    broj: 'B2G-INV-2026-0001',
    issueDate: '2026-05-26',
    datumIzdavanja: '2026-05-26',
    pibProdavca: '101134702',
    pibS: '101134702',
    pibKupca: '113398540',
    pibB: '113398540',
    jbkjs: '12345',
    buyerReference: 'UGOVOR-4491-A',
    tipDokumenta: '380',
    osnovica: 10000,
    pdv: 2000,
    valuta: 'RSD'
  };

  it('01. Should successfully validate compliant B2G payloads', () => {
    const clean = MasterValidator.validate(validB2GPayload, { mode: 'B2G' });
    expect(clean.jbkjsB).toBe('12345');
    expect(clean.buyerReference).toBe('UGOVOR-4491-A');
  });

  it('02. Should successfully validate normal B2B payload without B2G rules', () => {
    // Normal B2B does not require buyerReference or jbkjs by default
    const b2bPayload = { ...validB2GPayload };
    delete b2bPayload.buyerReference;
    delete b2bPayload.jbkjs;

    const clean = MasterValidator.validate(b2bPayload, { mode: 'B2B' });
    expect(clean.buyerReference).toBeUndefined();
    expect(clean.jbkjsB).toBeUndefined();
  });

  it('03. Should reject B2G payload missing buyerReference', () => {
    const invalidPayload = { ...validB2GPayload };
    delete invalidPayload.buyerReference;

    expect(() => {
      MasterValidator.validate(invalidPayload, { mode: 'B2G' });
    }).toThrowError(/BuyerReference/);
  });

  it('04. Should reject B2G payload missing JBKJS code', () => {
    const invalidPayload = { ...validB2GPayload };
    delete invalidPayload.jbkjs;

    expect(() => {
      MasterValidator.validate(invalidPayload, { mode: 'B2G' });
    }).toThrowError(/jbkjs/);
  });

  it('05. Should reject B2G payload with invalid JBKJS format (non-5 digit)', () => {
    const invalidPayload = { ...validB2GPayload, jbkjs: '1234' }; // 4 digits instead of 5

    expect(() => {
      MasterValidator.validate(invalidPayload, { mode: 'B2G' });
    }).toThrowError(/5 cifara/);
  });
});
