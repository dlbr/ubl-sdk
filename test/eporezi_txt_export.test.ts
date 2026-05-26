import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { SefPppdvExporter } from '@sef/shared/services/pppdvExporter';
import type { PppdvSummary } from '../packages/backend/src/KlijentBazaObject';

describe('e-Porezi TXT Export v3.5.0 — Forensic Audit', () => {

  it('Treba generisati potpun TXT fajl sa svim novim pozicijama (Uvoz, Interni, Oslobođenja)', () => {
    const summary: PppdvSummary = {
      period: '2026-05',
      pozicija001_osnovicaOpsta: 1000,
      pozicija101_pdvOpsta: 200,
      pozicija002_osnovicaPosebna: 500,
      pozicija102_pdvPosebna: 50,
      pozicija003_oslobodjenSaPravom: 100,
      pozicija004_oslobodjenBezPrava: 20,
      pozicija005_uvozOsnovica: 300,
      pozicija105_uvozPdv: 60,
      pozicija006_interniObracunOsnovica: 400,
      pozicija106_interniObracunPdv: 80,
      pozicija008_prethodniPorezOdbitni: 300,
      porezZaUplatuIliPovracaj: (200 + 50 + 60 + 80) - 300 // 90
    };

    const pib = '101134702';
    const txt = SefPppdvExporter.generateTxt(pib, summary);

    // Heder
    expect(txt).toContain(`H|1.0|PPPDV|${pib}|2026-05-01|2026-05-31`);

    // Pozicije
    expect(txt).toContain('D|001|1000');
    expect(txt).toContain('D|101|200');
    expect(txt).toContain('D|004|20');
    expect(txt).toContain('D|005|300');
    expect(txt).toContain('D|105|60');
    expect(txt).toContain('D|006|400');
    expect(txt).toContain('D|106|80');
    
    // Ukupno obračunato (110) = 200 + 50 + 60 + 80 = 390
    expect(txt).toContain('D|110|390');
    
    // Prethodni porez (008/108)
    expect(txt).toContain('D|008|300');
    expect(txt).toContain('D|108|300');

    // Za uplatu (111)
    expect(txt).toContain('D|111|90');
  });
});
