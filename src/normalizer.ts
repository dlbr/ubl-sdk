export class Normalizer {
  static sanitize(data: any) {
    const clean = { ...data };

    // 1. PIB normalizacija (padStart)
    if (clean.pibProdavca) clean.pibProdavca = clean.pibProdavca.toString().padStart(9, '0');
    if (clean.pibKupca) clean.pibKupca = clean.pibKupca.toString().padStart(9, '0');

    // 2. Default vrednosti za izvoz
    if (clean.valuta === 'EUR' && clean.poreskaKategorija === 'E' && !clean.sifraOslobodjenja) {
      clean.sifraOslobodjenja = 'PDV-RS-24-1';
    }

    // 3. Iznos (force float)
    clean.osnovica = parseFloat(clean.osnovica || 0);

    return clean;
  }
}
