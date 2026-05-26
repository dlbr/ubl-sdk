import { describe, it, expect } from 'vitest';
import { safeParse } from 'valibot';
import { SefInvoiceSchema } from '../src/validators/ubl';
import { validanPIB } from '@dlbr/ubl-sdk';

// ─────────────────────────────────────────────────────────────────────────────
// PIB Checksum Validator Test Suite
//
// Algoritam Poreske uprave Srbije (mod-11, prilagođen):
//   suma = 10
//   for i in 0..7:
//     suma = (suma + digit[i]) % 10
//     suma = (suma === 0 ? 10 : suma) * 2 % 11
//   kontrolna = (11 - suma) % 10
//
// Izvor: https://mladsoft.com/2019/06/04/validacija-pib-mb-i-dr/
// ─────────────────────────────────────────────────────────────────────────────

/** Reproduce the same checksum used in validator.ts — tests must be self-consistent */
function kontrolnaCifra(pib: string): number {
  let suma = 10;
  for (let i = 0; i < 8; i++) {
    suma = (suma + parseInt(pib[i], 10)) % 10;
    suma = (suma === 0 ? 10 : suma) * 2 % 11;
  }
  return (11 - suma) % 10;
}

const bazicnaFaktura = {
  id: 'FKT-PIB-TEST',
  invoiceTypeCode: '380',
  issueDate: '2026-05-26',
  paymentDueDate: '2026-06-10',
  documentCurrencyCode: 'RSD',
  taxCurrencyCode: 'RSD',
  payableAmount: 12000.00,
  lineExtensionAmount: 10000.00,
  taxExclusiveAmount: 10000.00,
  taxInclusiveAmount: 12000.00,
  taxAmount: 2000.00,
  taxTotals: [{
    taxAmount: 2000.00,
    taxSchemeId: 'VAT',
    subtotals: [{ taxableAmount: 10000.00, taxAmount: 2000.00, taxCategoryCode: 'S' }]
  }],
};

describe('🛡️ PIB Checksum Validator [SRB Mod-11 Algoritam]', () => {

  // ─── Poznati, realni PIB-ovi ──────────────────────────────────────────────

  it('✅ Telekom Srbija (101134702) mora proći checksum', () => {
    const res = safeParse(SefInvoiceSchema, {
      ...bazicnaFaktura,
      pibS: '101134702',
      pibB: '101134702'
    });
    if (!res.success) console.log('Issues:', res.issues.map(i => i.message));
    expect(res.success).toBe(true);
  });

  it('✅ Matematički izračunat validan PIB (100000008) mora proći', () => {
    // Kontrolna: suma niz '10000000' → kontrolna = 8 → PIB: 100000008
    expect(kontrolnaCifra('10000000')).toBe(8);
    const res = safeParse(SefInvoiceSchema, {
      ...bazicnaFaktura,
      pibS: '100000008',
      pibB: '100000008'
    });
    expect(res.success).toBe(true);
  });

  it('✅ Matematički izračunat validan PIB (200000013) mora proći', () => {
    // Kontrolna: suma niz '20000001' → kontrolna = 3 → PIB: 200000013
    expect(kontrolnaCifra('20000001')).toBe(3);
    const res = safeParse(SefInvoiceSchema, {
      ...bazicnaFaktura,
      pibS: '200000013',
      pibB: '200000013'
    });
    expect(res.success).toBe(true);
  });

  it('✅ Matematički izračunat validan PIB (100000188) mora proći', () => {
    // kontrolna('10000018') = 8 → PIB: 100000188
    expect(kontrolnaCifra('10000018')).toBe(8);
    const res = safeParse(SefInvoiceSchema, {
      ...bazicnaFaktura,
      pibS: '100000188',
      pibB: '100000188'
    });
    expect(res.success).toBe(true);
  });

  // ─── Nevalidni checksum ───────────────────────────────────────────────────

  it('🛑 Odbij PIB sa pogrešnom kontrolnom cifrom (100000009 umesto 100000008)', () => {
    // Kontrolna za '10000000' je 8, ali šaljemo 9
    const res = safeParse(SefInvoiceSchema, {
      ...bazicnaFaktura,
      pibS: '100000009',
      pibB: '100000008'
    });
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('kriptografski ispravan');
  });

  it('🛑 Odbij PIB sa pogrešnom kontrolnom cifrom (101134700 umesto 101134702)', () => {
    // Telekom PIB zadnja cifra promenjena sa 2 na 0
    const res = safeParse(SefInvoiceSchema, {
      ...bazicnaFaktura,
      pibS: '101134700',
      pibB: '101134702'
    });
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('kriptografski ispravan');
  });

  it('🛑 Odbij nasumičan 9-cifreni broj koji ne prolazi checksum (123456789)', () => {
    // Napadač koji pošalje nasumičan PIB mora biti odbijen
    const kontrolna = kontrolnaCifra('12345678');
    expect(parseInt('9', 10)).not.toBe(kontrolna); // potvrdi da je zaista nevalidan
    const res = safeParse(SefInvoiceSchema, {
      ...bazicnaFaktura,
      pibS: '123456789',
      pibB: '100000008'
    });
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('kriptografski ispravan');
  });

  it('🛑 Odbij PIB sa slovima (11339854ABC)', () => {
    const res = safeParse(SefInvoiceSchema, {
      ...bazicnaFaktura,
      pibS: '11339854ABC',
      pibB: '100000008'
    });
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('kriptografski ispravan');
  });

  it('🛑 Odbij PIB sa samo 4 cifre (1234)', () => {
    const res = safeParse(SefInvoiceSchema, {
      ...bazicnaFaktura,
      pibS: '1234',
      pibB: '100000008'
    });
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('kriptografski ispravan');
  });

  it('🛑 Odbij PIB koji je niz nula (000000000)', () => {
    // Nula-PIB je format-validan ali checksum ga odbija
    const res = safeParse(SefInvoiceSchema, {
      ...bazicnaFaktura,
      pibS: '000000000',
      pibB: '100000008'
    });
    expect(res.success).toBe(false);
  });

  // ─── Strogo: EU / strani format se odbija ──────────────────────────────────

  it('🛑 Odbij EU PIB (8-cifara) — SEF sistem ne dozvoljava strane PIB-ove', () => {
    // Oba učesnika moraju biti registrovana u Srbiji → tuđ PIB pada
    const res = safeParse(SefInvoiceSchema, {
      ...bazicnaFaktura,
      pibS: '12345678',    // 8 cifara — nevalidan za SEF
      pibB: '100000008'
    });
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('tačno 9 cifara');
  });

  it('🛑 Odbij EU VAT broj (13-cifara) — nema stranog formata u SEF', () => {
    const res = safeParse(SefInvoiceSchema, {
      ...bazicnaFaktura,
      pibS: '1234567890123', // 13 cifara
      pibB: '100000008'
    });
    expect(res.success).toBe(false);
    expect(res.issues![0].message).toContain('tačno 9 cifara');
  });

  // ─── Edge case: PIB u kupcu (pibB) ───────────────────────────────────────

  it('🛑 Odbij fakturu ako kupac ima nevalidan PIB checksum (pibB)', () => {
    const res = safeParse(SefInvoiceSchema, {
      ...bazicnaFaktura,
      pibS: '100000008',   // validan prodavac
      pibB: '999999999'    // nevalidan kupac — checksum neće proći
    });
    const kontrolnaZa99999999 = kontrolnaCifra('99999999');
    if (parseInt('9', 10) !== kontrolnaZa99999999) {
      expect(res.success).toBe(false);
      expect(res.issues![0].message).toContain('kriptografski ispravan');
    }
    // Ako slučajno prođe checksum (retko, ali moguće), test je N/A
  });

  // ─── Utility: provjera samog algoritma ───────────────────────────────────

  it('🔬 kontrolnaCifra() funkcija daje iste rezultate kao validator', () => {
    expect(kontrolnaCifra('10113470')).toBe(2);  // Telekom 101134702
    expect(kontrolnaCifra('10000000')).toBe(8);  // 100000008
    expect(kontrolnaCifra('20000001')).toBe(3);  // 200000013
    expect(kontrolnaCifra('10000018')).toBe(8);  // 100000188
  });

  it('🛑 Odbij bilo koji PIB koji nije tačno 9 cifara', () => {
    const nevalidni = ['1', '12', '1234', '12345678', '1234567890', '123456789012345'];
    for (const pib of nevalidni) {
      expect(validanPIB(pib)).toBe(false);
    }
  });
});
