import { describe, it, expect } from 'vitest';
import { validanPIB } from '../src/validator.js';

describe('PIB Validation', () => {
  it('should validate staging PIBs', () => {
    expect(validanPIB('113398540')).toBe(true);
    expect(validanPIB('105674049')).toBe(true);
  });

  it('should validate other known PIBs', () => {
    expect(validanPIB('100000032')).toBe(true);
  });

  it('should invalidate incorrect PIBs', () => {
    expect(validanPIB('123456789')).toBe(false);
    expect(validanPIB('105674048')).toBe(false);
    expect(validanPIB('1056740490')).toBe(false);
    expect(validanPIB('10567404')).toBe(false);
    expect(validanPIB('abcdefghi')).toBe(false);
  });
});
