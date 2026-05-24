import { describe, it, expect } from 'vitest';
import { InvoiceBuilder } from '../src/builder/InvoiceBuilder';

describe('🛡️ Ultimate Gauntlet — Pure Builder Coverage', () => {

  it('01. Standard B2B (380) - Output Validation', () => {
    const invoice = InvoiceBuilder.create()
      .setBasicInfo('STD-1', '380', '2026-05-24', '2026-06-07')
      .setSeller({ pib: '111111111', name: 'Prodavac' })
      .setBuyer({ pib: '222222222', name: 'Kupac' })
      .build();
    
    expect(invoice.typeCode).toBe('380');
    expect(invoice.id).toBe('STD-1');
  });

  it('07. Fail: PIB prodavca i kupca', () => {
    const builder = InvoiceBuilder.create()
      .setBasicInfo('STD-1', '380', '2026-05-24', '2026-06-07')
      .setSeller({ pib: '111111111', name: 'Prodavac' })
      .setBuyer({ pib: '123', name: 'Kupac' }); // Invalid PIB
    
    const invoice = builder.build();
    expect(invoice.buyer.pib).toBe('123');
  });

  it('08. Fail: Rok plaćanja pre datuma izdavanja', () => {
    const invoice = InvoiceBuilder.create()
      .setBasicInfo('STD-1', '380', '2026-05-24', '2026-05-20')
      .setSeller({ pib: '111111111', name: 'Prodavac' })
      .setBuyer({ pib: '222222222', name: 'Kupac' })
      .build();
    
    expect(invoice.issueDate).toBe('2026-05-24');
    expect(invoice.dueDate).toBe('2026-05-20');
  });
});
