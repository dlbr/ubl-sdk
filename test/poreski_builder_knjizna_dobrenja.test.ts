import { describe, it, expect } from 'vitest';
import { SefPoreskiJsonBuilder } from '../src/services/PoreskiJsonBuilder';

describe('PoreskiJsonBuilder - Master Scenarios (Knjižna odobrenja)', () => {

  describe('Scenario 381: Knjižno odobrenje (Smanjenje osnovice)', () => {
    it('should map 381 with correct tax category and negative base amount', () => {
      const data = {
        poreskiPeriod: '2026-05',
        invoiceTypeCode: '381',
        osnovicaOpsta: -1000, // Smanjenje mora biti negativno
        pdvOpsta: -200,
        poreskaKategorija: 'S20'
      };
      
      const result = SefPoreskiJsonBuilder.buildPojedinacnaEeoPayload(data);
      
      expect(result.TaxRecords[0].Amount).toBe(-1000);
      expect(result.TaxRecords[0].TaxCategory).toBe('S20');
    });
  });

  describe('Scenario: Knjižno odobrenje avansa (SrbDtExt)', () => {
    it('should correctly include SrbDtExt tags for credit notes', () => {
      const data = {
        poreskiPeriod: '2026-05',
        invoiceTypeCode: '381',
        osnovicaOpsta: -500,
        pdvOpsta: -100,
        zbirniEeo: true // Specifičan scenario za zbirno knjižno odobrenje
      };

      const result = SefPoreskiJsonBuilder.buildZbirniEeoPayload(data);
      // Ovde proveravamo da li Builder ubacuje neophodne ekstenzije
      expect(result.SrbDtExt).toBeDefined();
    });
  });

  describe('Stress & Compliance: Invalid Scenarios', () => {
    it('should reject 381 if invoiceTypeCode does not match input', () => {
      const data = { 
        poreskiPeriod: '2026-05',
        invoiceTypeCode: '380', // Pogrešan tip za knjižno odobrenje
        osnovicaOpsta: 1000,
        isIndividual: true
      };
      // Builder mora biti defanzivan i odbiti netačan biznis tip
      expect(() => SefPoreskiJsonBuilder.buildPojedinacnaEeoPayload(data as any))
        .toThrow(/INVALID_INVOICE_TYPE_FOR_INDIVIDUAL/);
    });
  });
});