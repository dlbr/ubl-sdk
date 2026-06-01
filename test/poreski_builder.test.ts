import { describe, it, expect } from 'vitest';
import { SefPoreskiJsonBuilder } from '../src/services/PoreskiJsonBuilder';

describe('PoreskiJsonBuilder - Titanium Suite', () => {

  // 1. Testiranje Poreskih Kategorija (Šifarnik SEF)
  describe('Tax Category Mapping', () => {
    it('should map standard tax categories correctly (S20, S10, E0)', () => {
      const data = {
        poreskiPeriod: '2026-05',
        osnovicaOpsta: 1000,
        pdvOpsta: 200, // S20
        osnovicaPosebna: 500,
        pdvPosebna: 50, // S10
        osnovicaOslobodjena: 200
        // E0 (Oslobođeno bez prava na odbitak)
      };
      
      const result = SefPoreskiJsonBuilder.buildZbirniEeoPayload(data);
      
      // Provera da li sistem prepoznaje sve kategorije iz specifikacije
      const categories = result.TaxRecords.map(r => r.Category);
      expect(categories).toContain('S20');
      expect(categories).toContain('S10');
      expect(categories).toContain('E0');
    });
  });

  // 2. Validacija Perioda i Biznis Pravila
  describe('Business Rules Constraints', () => {
    it('should throw error for invalid tax period format', () => {
      const invalidData = { poreskiPeriod: '2026/05', osnovicaOpsta: 1000 };
      expect(() => SefPoreskiJsonBuilder.buildZbirniEeoPayload(invalidData as any))
        .toThrow(); // Očekujemo validacionu grešku iz Valibot šeme
    });

    it('should prevent processing future periods', () => {
      const data = { poreskiPeriod: '2030-01', osnovicaOpsta: 100 };
      expect(() => SefPoreskiJsonBuilder.buildZbirniEeoPayload(data as any))
        .toThrow(/FUTURE_PERIOD/); 
    });
  });

  // 3. Matematička Preciznost (Billing Ledger Logic)
  describe('Mathematical Precision', () => {
    it('should handle floating point numbers without precision loss', () => {
      const data = { 
        poreskiPeriod: '2026-05', 
        osnovicaOpsta: 1000.555, // Preciznost do 3 decimale
        pdvOpsta: 200.111 
      };
      const result = SefPoreskiJsonBuilder.buildZbirniEeoPayload(data);
      
      // Finansijska preciznost je kritična za billing ledger
      expect(result.TaxRecords[0].Amount).toBe(1000.555);
    });
  });

  // 4. EPP (Evidencija Prethodnog Poreza)
  describe('buildEppPayload', () => {
    it('should strictly validate required EPP fields', () => {
      const data = { 
        poreskiPeriod: '2026-05', 
        // Missing fields to trigger schema failure
      };
      expect(() => SefPoreskiJsonBuilder.buildEppPayload(data as any))
        .toThrow(); // Valibot šema mora biti "Single Source of Truth"
    });
  });
});