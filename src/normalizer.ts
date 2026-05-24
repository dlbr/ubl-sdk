export class Normalizer {
  static sanitize(data: any) {
    const clean = { ...data };

    // Support both new Model (seller.pib) and Legacy flat JSON (pibProdavca)
    
    // 1. PIB normalizacija
    if (clean.seller?.pib) clean.seller.pib = clean.seller.pib.toString().padStart(9, '0');
    if (clean.buyer?.pib) clean.buyer.pib = clean.buyer.pib.toString().padStart(9, '0');
    
    if (clean.pibProdavca) clean.pibProdavca = clean.pibProdavca.toString().padStart(9, '0');
    if (clean.pibKupca) clean.pibKupca = clean.pibKupca.toString().padStart(9, '0');

    // 2. Default vrednosti za izvoz
    const currency = clean.currency || clean.valuta;
    const cat = clean.poreskaKategorija || (clean.lines && clean.lines[0]?.taxCategory);
    
    if (currency === 'EUR' && cat === 'E' && !clean.sifraOslobodjenja) {
      clean.sifraOslobodjenja = 'PDV-RS-24-1';
    }

    // 3. Iznos (force float)
    if (clean.osnovica) clean.osnovica = parseFloat(clean.osnovica || 0);

    return clean;
  }
}
