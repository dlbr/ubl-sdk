// packages/sef-ubl-builder/test/sef_matrix_complete.test.ts
import { describe, it, expect } from 'vitest';
import { SefUblBuilder, SefPoreskiJsonBuilder } from '../src/index';

describe('🛡️ SEF Matrix XML Builder — Kompletan Poreski i XML Audit', () => {

  it('1. Avansna Faktura (386) sa obračunatim PDV-om', () => {
    const xml = SefUblBuilder.buildAvansni({
      broj: 'AV-1', pibProdavca: '100000001', pibKupca: '200000002', osnovica: 1000, pdv: 200
    });
    expect(xml).toContain('<cbc:InvoiceTypeCode>386</cbc:InvoiceTypeCode>');
    expect(xml).toContain('<cbc:ID>S</cbc:ID>');
    expect(xml).toContain('<cbc:Percent>20.00</cbc:Percent>');
    expect(xml).toContain('<cbc:TaxableAmount currencyID="RSD">1000.00</cbc:TaxableAmount>');
    expect(xml).toContain('<cbc:TaxAmount currencyID="RSD">200.00</cbc:TaxAmount>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="RSD">1200.00</cbc:PayableAmount>');
  });

  it('2. Konačna faktura sa zatvaranjem avansa (380)', () => {
    const xml = SefUblBuilder.buildKonacniSaAvansom({
      broj: 'KON-1', pibProdavca: '100000001', pibKupca: '200000002',
      avansBroj: 'AV-1', avansDatum: '2026-05-21',
      ukupnaOsnovica: 2000, ukupniPdv: 400, odbitakAvansaSaPdv: 1200,
      pdvStopa: 20
    });
    
    expect(xml).toContain('<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>');
    expect(xml).toContain('<cbc:ID>S</cbc:ID>');
    expect(xml).toContain('<cbc:Percent>20.00</cbc:Percent>');
    expect(xml).toContain('<cac:InvoiceLine>');
    expect(xml).toContain('<cbc:ID>AVANS-REDUKCIJA</cbc:ID>');
    // Umanjena osnovica (2000 - 1000) i umanjeni PDV (400 - 200)
    expect(xml).toContain('<cbc:TaxableAmount currencyID="RSD">1000.00</cbc:TaxableAmount>');
    expect(xml).toContain('<cbc:TaxAmount currencyID="RSD">200.00</cbc:TaxAmount>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="RSD">1200.00</cbc:PayableAmount>');
  });

  it('3. Knjižno Odobrenje / Smanjenje (381) — Pozitivni iznosi u CreditNote', () => {
    const xml = SefUblBuilder.buildSmanjenje({
      broj: 'STO-1', pibProdavca: '100000001', pibKupca: '200000002',
      referentniRacun: 'KON-1', razlog: 'Greška u ceni',
      iznosZaSmanjenjeOsnovice: 1000, iznosZaSmanjenjePdv: 200,
      smerDokumenta: 'POZITIVAN' // Usklađeno sa EN 16931-1: CreditNote nosi pozitivne vrednosti
    });
    expect(xml).toContain('<CreditNote');
    expect(xml).toContain('<cbc:ID>S</cbc:ID>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="RSD">1200.00</cbc:PayableAmount>');
  });

  it('4. Knjižno Zaduženje / Povećanje (383)', () => {
    const xml = SefUblBuilder.buildPovecanje({
      broj: 'ZAD-1', pibProdavca: '100000001', pibKupca: '200000002',
      referentniRacun: 'KON-1', datumReferentnog: '2026-05-21',
      iznosZaPovecanjeOsnovice: 500, iznosZaPovecanjePdv: 100
    });
    expect(xml).toContain('<cbc:InvoiceTypeCode>383</cbc:InvoiceTypeCode>');
    expect(xml).toContain('<cbc:ID>S</cbc:ID>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="RSD">600.00</cbc:PayableAmount>');
  });

  it('5. Dokument o smanjenju avansa (381 SrbDtExt)', () => {
    const xml = SefUblBuilder.buildSmanjenjeAvansa({
      broj: 'SMAV-1', pibProdavca: '100000001', pibKupca: '200000002',
      avansBroj: 'AV-1', avansDatum: '2026-05-21',
      iznosSmanjenjaOsnovice: 500, iznosSmanjenjaPdv: 100,
      smerDokumenta: 'NEGATIVAN'
    });
    expect(xml).toContain('<sbt:SrbDtExt>');
    expect(xml).toContain('<cbc:ID>S</cbc:ID>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="RSD">0.00</cbc:PayableAmount>');
  });

  it('6. Dokument o smanjenju u periodu (381 InvoicePeriod)', () => {
    const xml = SefUblBuilder.buildSmanjenjeUPeriodu({
      broj: 'SMPER-1', pibProdavca: '100000001', pibKupca: '200000002',
      periodOd: '2026-01-01', periodDo: '2026-03-31',
      iznosZaSmanjenjeOsnovice: 1000, iznosZaSmanjenjePdv: 200,
      smerDokumenta: 'NEGATIVAN'
    });
    expect(xml).toContain('<cac:InvoicePeriod>');
    expect(xml).toContain('<cbc:ID>S</cbc:ID>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="RSD">-1200.00</cbc:PayableAmount>');
  });

  it('8. Faktura sa oslobođenjem od PDV-a (380 TaxCategory E)', () => {
    const xml = SefUblBuilder.buildOslobodjena({
      broj: 'OSL-1', pibProdavca: '100000001', pibKupca: '200000002',
      iznos: 1000, poreskaKategorija: 'E', sifraOslobodjenja: 'PDV-RS-24-1-1'
    });
    expect(xml).toContain('<cbc:ID>E</cbc:ID>');
    expect(xml).toContain('<cbc:TaxExemptionReasonCode>PDV-RS-24-1-1</cbc:TaxExemptionReasonCode>');
    expect(xml).toContain('<cbc:TaxAmount currencyID="RSD">0.00</cbc:TaxAmount>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="RSD">1000.00</cbc:PayableAmount>');
  });

  it('9. Faktura sa popustom (380 AllowanceCharge)', () => {
    const xml = SefUblBuilder.buildSaPopustom({
      broj: 'POP-1', pibProdavca: '100000001', pibKupca: '200000002',
      iznosPrePopusta: 1000, popustIznos: 100, pdvStopa: 20
    });
    expect(xml).toContain('<cac:AllowanceCharge>');
    expect(xml).toContain('<cbc:ID>S</cbc:ID>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="RSD">1080.00</cbc:PayableAmount>');
  });

  it('13. Standardna faktura (380)', () => {
    const xml = SefUblBuilder.buildStandardna({
      broj: 'STD-1', pibProdavca: '100000001', pibKupca: '200000002',
      osnovica: 1000, pdv: 200
    });
    expect(xml).toContain('<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>');
    expect(xml).toContain('<cbc:ID>S</cbc:ID>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="RSD">1200.00</cbc:PayableAmount>');
  });

  // ─── NOVI INTEGRACIONI TESTOVI ZA HARDIFIKACIJU KODA ───
  describe('🔒 Oklop i Validacija za Specifične Scenarije (v3.8.5)', () => {
    
    it('14. Faktura sa Base64 Prilogom mora sadržati ispravan TaxTotal blok', () => {
      const xml = SefUblBuilder.buildSaPrilogom({
        broj: 'PRIL-1', pibProdavca: '100000001', pibKupca: '200000002',
        ukupno: 1200, prilogIme: 'izvestaj.pdf', prilogBase64: 'JVBERi0xLjQK...'
      });
      // Verifikujemo da iako ima prilog, XML sadrži obavezan poreski štit tražen priručnikom iz aprila 2026.
      expect(xml).toContain('<cac:TaxTotal>');
      expect(xml).toContain('<cbc:TaxAmount currencyID="RSD">200.00</cbc:TaxAmount>');
      expect(xml).toContain('<cbc:TaxableAmount currencyID="RSD">1000.00</cbc:TaxableAmount>');
      expect(xml).toContain('<cbc:PayableAmount currencyID="RSD">1200.00</cbc:PayableAmount>');
    });

    it('15. Faktura u stranoj valuti (EUR) mora iskazati PDV isključivo u RSD', () => {
      const xml = SefUblBuilder.buildSaValutom({
        broj: 'VAL-EUR-1', pibProdavca: '100000001', pibKupca: '200000002',
        valuta: 'EUR', kurs: 117.20, kursDatum: '2026-05-21',
        ukupnoValuta: 100, pdvRSD: 2344.00, osnovicaRSD: 11720.00
      });
      // Poreski obračun mora prkositi stranoj valuti i ostati u dinarima (Zakon o PDV)
      expect(xml).toContain('<cac:TaxTotal>');
      expect(xml).toContain('<cbc:TaxAmount currencyID="RSD">2344.00</cbc:TaxAmount>');
      expect(xml).toContain('<cbc:TaxableAmount currencyID="RSD">11720.00</cbc:TaxableAmount>');
      
      // Ukupno plaćanje ostaje vezano za EUR ugovorenu valutu
      expect(xml).toContain('<cbc:PayableAmount currencyID="EUR">100.00</cbc:PayableAmount>');
    });
  });

  describe('📊 v3.8.0 Master Specifikacija Alignment Audit', () => {
    it('1. Poreska kategorija N (Anuliranje) sa POZITIVNIM smerom', () => {
      const xml = SefUblBuilder.buildSmanjenje({
        broj: 'STR-N-POS', pibProdavca: '100000001', pibKupca: '200000002',
        referentniRacun: 'INV-1', razlog: 'Specifičan režim',
        iznosZaSmanjenjeOsnovice: 1000, iznosZaSmanjenjePdv: 0,
        poreskaKategorija: 'N',
        smerDokumenta: 'POZITIVAN'
      });
      expect(xml).toContain('<cbc:ID>N</cbc:ID>');
      expect(xml).toContain('<cbc:Percent>0.00</cbc:Percent>');
      expect(xml).toContain('>0.00</cbc:TaxAmount>');
      expect(xml).toContain('>1000.00</cbc:TaxableAmount>');
      expect(xml).toContain('>1000.00</cbc:PayableAmount>');
    });

    it('2. Poreska kategorija N (Anuliranje) sa NEGATIVNIM smerom', () => {
      const xml = SefUblBuilder.buildSmanjenje({
        broj: 'STR-N-NEG', pibProdavca: '100000001', pibKupca: '200000002',
        referentniRacun: 'INV-1', razlog: 'Storno',
        iznosZaSmanjenjeOsnovice: 1000, iznosZaSmanjenjePdv: 200,
        poreskaKategorija: 'N',
        smerDokumenta: 'NEGATIVAN',
        pdvStopa: 20
      });
      expect(xml).toContain('<cbc:ID>N</cbc:ID>');
      expect(xml).toContain('>-200.00</cbc:TaxAmount>');
      expect(xml).toContain('>-1000.00</cbc:TaxableAmount>');
      expect(xml).toContain('>-1200.00</cbc:PayableAmount>');
    });

    it('3. AE Kategorija (Obrnuti obračun) sa Percent tagom', () => {
       const xml = SefUblBuilder.buildStandardna({
         broj: 'AE-1', pibProdavca: '100000001', pibKupca: '200000002',
         osnovica: 1000, pdv: 200, poreskaKategorija: 'AE'
       });
       expect(xml).toContain('<cbc:ID>AE</cbc:ID>');
       expect(xml).toContain('<cbc:Percent>20.00</cbc:Percent>');
    });
  });
});
