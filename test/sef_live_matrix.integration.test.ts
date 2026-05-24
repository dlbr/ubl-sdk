import { describe, it, expect } from 'vitest';
import { SefUblBuilder } from '@dlbr/ubl-sdk';

describe('🛡️ SEF Matrix XML Builder — Kompletan Poreski i XML Audit', () => {

  it('1. Avansna Faktura (386) sa obračunatim PDV-om', () => {
    const xml = SefUblBuilder.buildAvansni({
      broj: 'AV-1', pibProdavca: '100000001', pibKupca: '200000002', osnovica: 1000, pdv: 200, poreskaKategorija: 'S20',
      datumIzdavanja: '2026-05-24', datumUplate: '2026-05-24', referentniRacun: 'PONUDA-100'
    });
    expect(xml).toContain('<cbc:InvoiceTypeCode>386</cbc:InvoiceTypeCode>');
    expect(xml).toContain('<cbc:ID>S20</cbc:ID>');
    expect(xml).toContain('<cbc:Percent>20.00</cbc:Percent>');
  });

  it('2. Konačna faktura sa zatvaranjem avansa (380)', () => {
    const xml = SefUblBuilder.buildKonacniSaAvansom({
      broj: 'KON-1', pibProdavca: '100000001', pibKupca: '200000002',
      avansBroj: 'AV-1', avansDatum: '2026-05-21',
      ukupnaOsnovica: 2000, ukupniPdv: 400, odbitakAvansaSaPdv: 600,
      pdvStopa: 20, poreskaKategorija: 'S20',
      referentniRacun: 'AV-1'
    });
    expect(xml).toContain('<cbc:ID>AVANS-REDUKCIJA</cbc:ID>');
  });

  it('3. Knjižno Odobrenje / Smanjenje (381)', () => {
    const xml = SefUblBuilder.buildSmanjenje({
      broj: 'STO-1', pibProdavca: '100000001', pibKupca: '200000002',
      referentniRacun: 'KON-1', iznosZaSmanjenjeOsnovice: 1000, iznosZaSmanjenjePdv: 200,
      poreskaKategorija: 'S20', datumReferentnog: '2026-05-21'
    });
    expect(xml).toContain('<cbc:ID>S20</cbc:ID>');
  });

  it('4. Knjižno Zaduženje / Povećanje (383)', () => {
    const xml = SefUblBuilder.buildPovecanje({
      broj: 'ZAD-1', pibProdavca: '100000001', pibKupca: '200000002',
      referentniRacun: 'KON-1', datumReferentnog: '2026-05-21',
      iznosZaPovecanjeOsnovice: 500, iznosZaPovecanjePdv: 100, poreskaKategorija: 'S20'
    });
    expect(xml).toContain('<cbc:ID>S20</cbc:ID>');
  });

  it('5. Dokument o smanjenju avansa (381 SrbDtExt)', () => {
    const xml = SefUblBuilder.buildSmanjenjeAvansa({
      broj: 'SMAV-1', pibProdavca: '100000001', pibKupca: '200000002',
      avansBroj: 'AV-1', avansDatum: '2026-05-21',
      iznosSmanjenjaOsnovice: 500, iznosSmanjenjaPdv: 100,
      poreskaKategorija: 'S20'
    });
    expect(xml).toContain('<sbt:SrbDtExt');
    expect(xml).toContain('<cbc:ID>S20</cbc:ID>');
  });

  it('6. Dokument o smanjenju u periodu (381 InvoicePeriod)', () => {
    const xml = SefUblBuilder.buildSmanjenjeUPeriodu({
      broj: 'SMPER-1', pibProdavca: '100000001', pibKupca: '200000002',
      periodOd: '2026-01-01', periodDo: '2026-03-31',
      iznosZaSmanjenjeOsnovice: 1000, poreskaKategorija: 'S20'
    });
    expect(xml).toContain('<cac:InvoicePeriod>');
    expect(xml).toContain('<cbc:ID>S20</cbc:ID>');
  });
});