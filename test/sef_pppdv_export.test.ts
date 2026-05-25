import { describe, it, expect } from 'vitest';
import { SefPppdvExporter } from '@sef/shared/services/pppdvExporter';

describe('SEF Bridge v2 — PPPDV Export Engine Audit', () => {

  it('Export Provera: Generisani TXT fajl mora pratiti zvaničnu sintaksu Ministarstva finansija', () => {
    const pib = '102345678';
    const summary = {
      period: '2026-05',
      pozicija001_osnovicaOpsta: 145001,
      pozicija101_pdvOpsta: 29000,
      pozicija002_osnovicaPosebna: 0,
      pozicija102_pdvPosebna: 0,
      pozicija003_oslobodjenSaPravom: 50000,
      pozicija004_oslobodjenBezPrava: 0,
      pozicija005_uvozOsnovica: 0,
      pozicija105_uvozPdv: 0,
      pozicija006_interniObracunOsnovica: 0,
      pozicija106_interniObracunPdv: 0,
      pozicija008_prethodniPorezOdbitni: 15000,
      porezZaUplatuIliPovracaj: 14000
    };

    const txt = SefPppdvExporter.generateTxt(pib, summary as any);

    // FORENZIČKA ZAKONSKA VERIFIKACIJA STRUKTURE
    // H|Verzija|Tip|PIB|DatumOd|DatumDo
    expect(txt).toContain('H|1.0|PPPDV|102345678|2026-05-01|2026-05-31');
    
    // D|Polje|Vrednost
    expect(txt).toContain('D|001|145001');
    expect(txt).toContain('D|101|29000');
    expect(txt).toContain('D|003|50000');
    expect(txt).toContain('D|110|29000'); // Ukupno obračunat (101 + 102 + 105 + 106)
    expect(txt).toContain('D|008|15000'); 
    expect(txt).toContain('D|108|15000'); 
    expect(txt).toContain('D|111|14000'); // Za uplatu/povraćaj

    console.log('✓ [TXT Export Test] Zvanična struktura za e-Poreze uspešno generisana.');
  });
});
