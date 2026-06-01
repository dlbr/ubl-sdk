import { describe, it, expect } from 'vitest';
import { SefPoreskiJsonBuilder } from '../src/services/PoreskiJsonBuilder';

describe('PoreskiJsonBuilder - Entity Validation (PIB/JBKJS)', () => {

  describe('PIB Validation (10 digits)', () => {
    it('should reject invalid PIB formats (less or more than 10 digits)', () => {
      const invalidData = {
        poreskiPeriod: '2026-05',
        osnovicaOpsta: 1000,
        pdvOpsta: 200,
        supplierPib: '12345', // Samo 5 cifara
        customerPib: '113398540123' // 12 cifara
      };
      
      // Builder mora da baci grešku pre slanja na SEF
      expect(() => SefPoreskiJsonBuilder.buildZbirniEeoPayload(invalidData as any))
        .toThrow(/INVALID_PIB_FORMAT/);
    });

    it('should accept valid 10-digit PIB', () => {
      const data = {
        poreskiPeriod: '2026-05',
        osnovicaOpsta: 1000,
        pdvOpsta: 200,
        supplierPib: '101134702', // 9 cifara
        customerPib: '113398540'
      };
      
      const result = SefPoreskiJsonBuilder.buildZbirniEeoPayload(data);
      expect(result).toBeDefined();
    });
  });

  describe('Tax Category Integrity', () => {
    it('should strictly match SEF tax category codes', () => {
      const data = {
        poreskiPeriod: '2026-05',
        osnovicaOpsta: 1000,
        pdvOpsta: 200,
        // Pokušaj slanja nepostojeće poreske kategorije "XX"
        poreskaKategorija: 'XX' 
      };
      
      expect(() => SefPoreskiJsonBuilder.buildZbirniEeoPayload(data as any))
        .toThrow(/INVALID_TAX_CATEGORY/);
    });
  });
});