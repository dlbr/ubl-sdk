import { describe, it, expect } from 'vitest';
import { SefPoreskiJsonBuilder } from '../src/services/PoreskiJsonBuilder';
import * as vatRecords from '../src/examples/vat-records';

describe('VAT Records Snapshot Regression Suite', () => {
  const records = Object.entries(vatRecords);

  it.each(records)('PoreskiJsonBuilder treba da obradi %s bez regresije', ([name, data]) => {
    // Provera da li builduje bez bacanja grešaka
    const result = SefPoreskiJsonBuilder.buildPojedinacnaEeoPayload(data);
    
    // Snapshot validacija
    expect(result).toMatchSnapshot();
  });
});
