/**
 * SEF Bridge v4.6.8 — Centralni registar poreskih i sistemskih šifara.
 * Usklađeno sa Hotfix-om 3.17.1 (07.05.2026).
 */
export const SEF_CONSTANTS = {
  PORESKE_KATEGORIJE: {
    S: 'S',
    AE: 'AE',
    E: 'E',
    Z: 'Z',
    R: 'R',
    N: 'N',
  },
  
  TIP_FAKTURE: {
    STANDARDNA: '380',
    KNJIZNO_ODOBRENJE: '381',
    KNJIZNO_ZADUZENJE: '383',
    AVANSNA: '386',
  }
} as const;

export const SEF_EXEMPTION_REASONS = {
  /**
   * @see docs/СЕФ детаљи исправке Hotfix 3.17.1_(1).pdf
   * Nova šifra za AE20 (Obrnuto obračunavanje) uvedena radi usklađivanja sa novim pravilnikom.
   */
  INVESTMENT_GOLD: 'PDV-RS-10-2-4а', 
  OLD_DEPRECATED_366_6: 'PDV-RS-366-6',
  STANDARD_IZVOZ: 'PDV-RS-24-1-1',
} as const;

export const PAYMENT_MEANS = {
  CREDIT_TRANSFER: '30'
} as const;
