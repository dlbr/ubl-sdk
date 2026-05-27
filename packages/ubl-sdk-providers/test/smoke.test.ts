import { describe, it, expect } from 'vitest';
import { FileSystemSchemaProvider } from '../src/index.js';

describe('Providers Smoke Test', () => {
  it('should be able to instantiate FileSystemSchemaProvider', () => {
    const provider = new FileSystemSchemaProvider('./');
    expect(provider).toBeDefined();
  });
});
