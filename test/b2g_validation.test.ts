import { describe, it, expect } from 'vitest';
import { MasterValidator } from '../src/validator';

describe('🛡️ B2G (Business-to-Government) Compliance Validation', () => {

  const validB2GPayload = {
    invoiceNumber: 'B2G-INV-2026-0001',
    issueDate: '2026-05-26',
    supplierPib: '101134702',
    customerPib: '113398540',
    customerJbkjs: '12345',
    buyerReference: 'UGOVOR-4491-A',
    invoiceTypeCode: '380',
    taxableAmount: 10000,
    taxAmount: 2000,
    payableAmount: 12000,
    currency: 'RSD',
    lines: [
      { id: '1', name: 'Item 1', quantity: 1, priceAmount: 10000, lineExtensionAmount: 10000, taxCategoryPercent: 20 }
    ]
  };

  it('01. Should successfully validate compliant B2G payloads', () => {
    const clean = MasterValidator.validate(validB2GPayload, { mode: 'B2G' });
    expect(clean.customerJbkjs).toBe('12345');
    expect(clean.buyerReference).toBe('UGOVOR-4491-A');
  });

  it('02. Should successfully validate normal B2B payload without B2G rules', () => {
    // Normal B2B does not require buyerReference or customerJbkjs
    const b2bPayload = { ...validB2GPayload };
    delete b2bPayload.buyerReference;
    delete b2bPayload.customerJbkjs;

    const clean = MasterValidator.validate(b2bPayload, { mode: 'B2B' });
    expect(clean.buyerReference).toBeUndefined();
    expect(clean.customerJbkjs).toBeUndefined();
  });

  it('03. Should reject B2G payload missing buyerReference', () => {
    const invalidPayload = { ...validB2GPayload };
    delete invalidPayload.buyerReference;

    expect(() => {
      MasterValidator.validate(invalidPayload, { mode: 'B2G' });
    }).toThrowError(/buyerReference/);
  });

  it('04. Should reject B2G payload missing JBKJS code', () => {
    const invalidPayload = { ...validB2GPayload };
    delete invalidPayload.customerJbkjs;

    expect(() => {
      MasterValidator.validate(invalidPayload, { mode: 'B2G' });
    }).toThrowError(/customerJbkjs/);
  });

  it('05. Should reject B2G payload with invalid JBKJS format (non-5 digit)', () => {
    const invalidPayload = { ...validB2GPayload, customerJbkjs: '1234' }; // 4 digits instead of 5

    expect(() => {
      MasterValidator.validate(invalidPayload, { mode: 'B2G' });
    }).toThrowError(/5 digits/);
  });
});
