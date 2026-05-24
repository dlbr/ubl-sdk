import { describe, it, expect } from 'vitest';
import { SefUblBuilder } from '../src/SefUblBuilder';
import { MasterValidator } from '../src/validator';

const gauntletVariants = [
  { id: '01_b2b_std', type: '380', valid: true },
  { id: '07_fail_pib', type: '380', valid: false, pib: '123' }, 
  { id: '08_fail_date', type: '386', valid: false, dueDateBeforeIssue: true },
  { id: '10_fail_neg', type: '380', valid: false, amount: -500 },
  { id: '11_fail_avans', type: '386', valid: false }, // Avans bez BillingReference
  { id: '12_fail_curr', type: '380', valid: false, valuta: 'EUR' }
];

describe('🛡️ Ultimate Gauntlet — Matrix Coverage', () => {
  it.each(gauntletVariants)('Variant $id should match expected validity', ({ valid, type, pib, dueDateBeforeIssue, amount, valuta }) => {
    let builder = SefUblBuilder.create().withTypeCode(type);
    
    if (pib) builder.withPib('111111111', pib);
    else builder.withPib('111111111', '222222222');

    if (amount !== undefined) builder.withAmount(amount);
    
    // Default valid dates
    builder.withIssueDate('2026-05-23');
    if (dueDateBeforeIssue) {
        builder.withDueDate('2026-05-20');
    } else {
        builder.withDueDate('2026-05-30');
    }

    const invoice = builder.build();
    
    if (valid) {
      expect(() => MasterValidator.validate(invoice)).not.toThrow();
    } else {
      expect(() => MasterValidator.validate(invoice)).toThrow('FATAL');
    }
  });
});
