import { describe, it, expect } from 'vitest';
import { SefPoreskiJsonBuilder, SefUblBuilder } from '@dlbr/ubl-sdk';

describe('SEF Bridge v3.4.0 — EEO & EPP (Evidencije) JSON Audit', () => {

  it('EEO Provera: Zbirna evidencija obračuna mora imati ispravan JSON format', () => {
    const data = {
      poreskiPeriod: '2026-05',
      osnovicaOpsta: 100000,
      pdvOpsta: 20000,
      osnovicaPosebna: 50000,
      pdvPosebna: 5000
    };

    const payload = SefPoreskiJsonBuilder.buildZbirniEeoPayload(data);

    expect(payload.Year).toBe(2026);
    expect(payload.Month).toBe(5);
    expect(payload.TaxRecords[0].TaxRatePercentage).toBe(20);
    expect(payload.TaxRecords[0].Amount).toBe(100000);
    expect(payload.TaxRecords[1].TaxRatePercentage).toBe(10);
    expect(payload.TaxRecords[1].TaxAmount).toBe(5000);
  });

  it('EPP Provera: Evidencija prethodnog poreza mora pratiti JSON šemu iz 2026.', () => {
    const data = {
      period: '2026-05',
      nabavkeOdObveznikaPdv: 450000.00,
      prethodniPorezOdObveznika: 90000.00,
      importPdvCarina: 30000.00
    };

    const payload = SefPoreskiJsonBuilder.buildEppPayload(data);

    expect(payload.Year).toBe(2026);
    expect(payload.InputTaxRecords).toHaveLength(2);
    expect(payload.InputTaxRecords[1].Type).toBe('Import');
    expect(payload.InputTaxRecords[1].TaxAmount).toBe(30000);
  });

  it('Generic Build: Mora vratiti JSON string za EEO i EPP tipove', () => {
    const eeoJson = SefUblBuilder.build({ TipZapisa: 'EEO', poreskiPeriod: '2026-05', osnovicaOpsta: 100, pdvOpsta: 20, osnovicaPosebna: 0, pdvPosebna: 0 });
    const parsed = JSON.parse(eeoJson);
    expect(parsed.Year).toBe(2026);

    const eppJson = SefUblBuilder.build({ TipZapisa: 'EPP', period: '2026-05', nabavkeOdObveznikaPdv: 100, prethodniPorezOdObveznika: 20, importPdvCarina: 0 });
    expect(eppJson).toContain('"Year":2026');
  });
});
