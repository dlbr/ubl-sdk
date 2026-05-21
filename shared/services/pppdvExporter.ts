import type { PppdvSummary } from '../../worker/KlijentBazaObject';

/**
 * SefPppdvExporter - Generiše zvanični TXT format za uvoz u portal e-Porezi.
 */
export class SefPppdvExporter {
  /**
   * Generiše string u zvaničnom formatu Poreske uprave Srbije (Deljeno cevima '|')
   */
  static generateTxt(pib: string, summary: PppdvSummary): string {
    const year = summary.period.split('-')[0];
    const month = summary.period.split('-')[1];
    
    // Određivanje prvog i poslednjeg dana u mesecu
    const dateOd = `${summary.period}-01`;
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    const dateDo = `${summary.period}-${lastDay}`;

    const lines: string[] = [];

    // H|Verzija|Tip|PIB|DatumOd|DatumDo
    lines.push(`H|1.0|PPPDV|${pib}|${dateOd}|${dateDo}`);

    // D|Polje|Vrednost
    if (summary.pozicija001_osnovicaOpsta > 0) lines.push(`D|001|${summary.pozicija001_osnovicaOpsta}`);
    if (summary.pozicija101_pdvOpsta > 0) lines.push(`D|101|${summary.pozicija101_pdvOpsta}`);
    if (summary.pozicija002_osnovicaPosebna > 0) lines.push(`D|002|${summary.pozicija002_osnovicaPosebna}`);
    if (summary.pozicija102_pdvPosebna > 0) lines.push(`D|102|${summary.pozicija102_pdvPosebna}`);
    if (summary.pozicija003_oslobodjenSaPravom > 0) lines.push(`D|003|${summary.pozicija003_oslobodjenSaPravom}`);
    if (summary.pozicija004_oslobodjenBezPrava > 0) lines.push(`D|004|${summary.pozicija004_oslobodjenBezPrava}`);
    
    // Uvoz
    if (summary.pozicija005_uvozOsnovica > 0) lines.push(`D|005|${summary.pozicija005_uvozOsnovica}`);
    if (summary.pozicija105_uvozPdv > 0) lines.push(`D|105|${summary.pozicija105_uvozPdv}`);

    // Interni obračun (Reverse Charge)
    if (summary.pozicija006_interniObracunOsnovica > 0) lines.push(`D|006|${summary.pozicija006_interniObracunOsnovica}`);
    if (summary.pozicija106_interniObracunPdv > 0) lines.push(`D|106|${summary.pozicija106_interniObracunPdv}`);

    // Polje 110 je zbir obračunatog PDV-a (101 + 102 + 103 + 104 + 105 + 106 + 107 + 109)
    const ukupnoObracunato = summary.pozicija101_pdvOpsta + summary.pozicija102_pdvPosebna + summary.pozicija105_uvozPdv + summary.pozicija106_interniObracunPdv;
    if (ukupnoObracunato > 0) lines.push(`D|110|${ukupnoObracunato}`);

    // Polje 008 / 108 (Prethodni porez)
    if (summary.pozicija008_prethodniPorezOdbitni > 0) {
      lines.push(`D|008|${summary.pozicija008_prethodniPorezOdbitni}`);
      lines.push(`D|108|${summary.pozicija008_prethodniPorezOdbitni}`);
    }

    // Polje 111 (Ukupno za uplatu ili povraćaj)
    lines.push(`D|111|${summary.porezZaUplatuIliPovracaj}`);

    return lines.join('\n');
  }
}
