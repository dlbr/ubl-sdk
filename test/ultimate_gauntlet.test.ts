import { describe, it, expect } from 'vitest';
import { SefUblBuilder } from '../src/SefUblBuilder';

describe('🛡️ Ultimate Gauntlet — Pure Builder Coverage', () => {

  it('01. Standard B2B (380) - Output Validation', () => {
    const invoice = SefUblBuilder.create()
      .withID('STD-1')
      .withTypeCode('380')
      .withAmount(1000)
      .build();
    
    expect(invoice.InvoiceTypeCode).toBe('380');
    expect(invoice.osnovica).toBe(1000);
  });

  it('07. Fail: PIB prodavca i kupca', () => {
    const invoice = SefUblBuilder.create()
      .withPib('111111111', '123')
      .build();
    
    // U realnom scenariju, Builder je "glup" i gradi sta mu das. 
    // Compliance validator bi ovo kasnije ulovio.
    expect(invoice.pibKupca).toBe('123');
  });

  it('08. Fail: Rok plaćanja pre datuma izdavanja', () => {
    const invoice = SefUblBuilder.create()
      .withIssueDate('2026-05-23')
      .withDueDate('2026-05-20')
      .build();
    
    expect(invoice.datumIzdavanja).toBe('2026-05-23');
    expect(invoice.datumUplate).toBe('2026-05-20');
  });
});
