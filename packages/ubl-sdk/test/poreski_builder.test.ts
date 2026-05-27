import { describe, it, expect } from 'vitest';
import { SefPoreskiJsonBuilder } from '../src/services/PoreskiJsonBuilder';

describe('PoreskiJsonBuilder', () => {
  it('should build zbirni EEO payload correctly', () => {
    const data = {
      poreskiPeriod: '2026-05',
      osnovicaOpsta: 1000,
      pdvOpsta: 200,
      osnovicaPosebna: 500,
      pdvPosebna: 50
    };
    const result = SefPoreskiJsonBuilder.buildZbirniEeoPayload(data);
    expect(result.Year).toBe(2026);
    expect(result.Month).toBe(5);
    expect(result.TaxRecords).toHaveLength(2);
    expect(result.TaxRecords[0].Amount).toBe(1000);
  });

  it('should build pojedinacna EEO payload', () => {
    const data = {
      poreskiPeriod: '2026-05',
      internalInvoiceNumber: 'FKT-001',
      osnovicaOpsta: 1000,
      pdvOpsta: 200
    };
    const result = SefPoreskiJsonBuilder.buildPojedinacnaEeoPayload(data);
    expect(result.Type).toBe('IndividualInternalInvoice');
    expect(result.TaxRecords[0].Amount).toBe(1000);
  });

  it('should build EPP payload', () => {
    const data = {
      poreskiPeriod: '2026-05',
      prethodniPorezOdObveznika: 500,
      importPdvCarina: 100
    };
    const result = SefPoreskiJsonBuilder.buildEppPayload(data);
    expect(result.InputTaxRecords[0].TaxAmount).toBe(500);
  });
});
