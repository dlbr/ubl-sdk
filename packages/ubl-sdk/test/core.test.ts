import { describe, it, expect } from 'vitest';
import { UBLValidationError } from '../src/core/UBLValidationError';

describe('Core - UBLValidationError', () => {
  it('should correctly capture message and details', () => {
    const details = { line: 10, path: '/Invoice/ID' };
    const err = new UBLValidationError('Test error', details);
    expect(err.message).toBe('Test error');
    expect(err.details).toEqual(details);
    expect(err.name).toBe('UBLValidationError');
  });
});
