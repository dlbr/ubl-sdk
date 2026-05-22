/**
 * SEF Tax Taxonomy & Compliance Constants (Hotfix 3.17.1 - 2026 Update)
 */

export const SEF_TAX_CATEGORIES = {
  STANDARD_20: 'S20',
  STANDARD_10: 'S10',
  REVERSE_CHARGE_20: 'AE20',
  REVERSE_CHARGE_10: 'AE10',
  EXEMPT: 'E',
  ZERO: 'Z',
  OTHER_EXEMPT: 'R',
  NON_VAT: 'N'
} as const;

export const SEF_EXEMPTION_REASONS = {
  INVESTMENT_GOLD: 'PDV-RS-10-2-4а', // Updated by Hotfix 3.17.1
  OLD_DEPRECATED_366_6: 'PDV-RS-366-6'
} as const;

export const PAYMENT_MEANS = {
  CREDIT_TRANSFER: '30'
} as const;
