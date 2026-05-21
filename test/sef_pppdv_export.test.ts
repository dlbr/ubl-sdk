import { describe, it, expect } from 'vitest';
import { SefPppdvExporter } from '../shared/services/pppdvExporter';

describe('SEF Bridge v2 — PPPDV Export Engine Audit', () => {

  it('Export Provera: Generisani TXT fajl mora pratiti zvaničnu sintaksu Ministarstva finansija', () => {
    const pib = '102345678';
    const summary = {
      period: '2026-05',
      pozicija001_osnovica20: 145001,
      pozicija101_pdv20: 29000,
      pozicija002_osnovica10: 0,
      pozicija102_pdv10: 0,
      pozicija003_oslobodjenSaPravom: 50000,
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
    expect(txt).toContain('D|110|29000'); // Ukupno obračunat (101 + 102)
    expect(txt).toContain('D|008|15000'); // Prethodni porez osnovica
    expect(txt).toContain('D|108|15000'); // Prethodni porez iznos
    expect(txt).toContain('D|111|14000'); // Za uplatu/povraćaj

    console.log('✓ [TXT Export Test] Zvanična struktura za e-Poreze uspešno generisana.');
  });
});
