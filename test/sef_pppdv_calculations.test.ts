import { describe, it, expect } from 'vitest';

/**
 * PoreskiProcesor - Simulacija unutrašnjeg poreskog procesora.
 */
class PoreskiProcesor {
  static izracunajPppdv(fakture: Array<{ tip: string; osnovica: number; pdv: number; kategorija: string; stopa: number }>) {
    let b20 = 0, p20 = 0, b10 = 0, p10 = 0, oslobodjen = 0;

    for (const f of fakture) {
      if (f.kategorija === 'S' && f.stopa === 20) {
        b20 += f.osnovica;
        p20 += f.pdv;
      } else if (f.kategorija === 'S' && f.stopa === 10) {
        b10 += f.osnovica;
        p10 += f.pdv;
      } else if (['E', 'Z', 'AE'].includes(f.kategorija)) {
        oslobodjen += f.osnovica;
      }
    }

    const p101 = Math.round(p20);
    const p102 = Math.round(p10);

    return {
      polje_001: Math.round(b20),
      polje_101: p101,
      polje_002: Math.round(b10),
      polje_102: p102,
      polje_003: Math.round(oslobodjen),
      ukupno_obracunato: p101 + p102
    };
  }
}

describe('SEF Bridge v2 — PPPDV Poreski Engine Audit', () => {

  it('Poreska provera: Sistem mora tačno da sumira redovne i avansne račune i zaokružuje u celim dinarima', () => {
    // Simuliramo promet u maju 2026. godine
    const realizovanPromet = [
      { tip: '380', osnovica: 100000.50, pdv: 20000.10, kategorija: 'S', stopa: 20 }, // Redovna faktura
      { tip: '386', osnovica: 45000.00, pdv: 9000.00, kategorija: 'S', stopa: 20 },   // Avansna faktura
      { tip: '380', osnovica: 50000.00, pdv: 5000.00, kategorija: 'S', stopa: 10 },   // 10% promet
      { tip: '380', osnovica: 50000.00, pdv: 0.00, kategorija: 'E', stopa: 0 }        // Izvoz (Oslobođeno)
    ];

    const obrazac = PoreskiProcesor.izracunajPppdv(realizovanPromet);

    // MATEMATIČKI OKLOP (Rounding after summation)
    // Polje 001: 100000.50 + 45000.00 = 145000.50 -> 145001
    expect(obrazac.polje_001).toBe(145001);
    
    // Polje 101: 20000.10 + 9000.00 = 29000.10 -> 29000
    expect(obrazac.polje_101).toBe(29000);
    
    // Polje 002: 50000
    expect(obrazac.polje_002).toBe(50000);
    
    // Polje 102: 5000
    expect(obrazac.polje_102).toBe(5000);

    // Polje 003: 50000
    expect(obrazac.polje_003).toBe(50000);

    // Ukupno obračunato: 29000 + 5000 = 34000
    expect(obrazac.ukupno_obracunato).toBe(34000);
  });
});
