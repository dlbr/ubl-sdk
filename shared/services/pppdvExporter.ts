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
    if (summary.pozicija001_osnovica20 > 0) lines.push(`D|001|${summary.pozicija001_osnovica20}`);
    if (summary.pozicija101_pdv20 > 0) lines.push(`D|101|${summary.pozicija101_pdv20}`);
    if (summary.pozicija002_osnovica10 > 0) lines.push(`D|002|${summary.pozicija002_osnovica10}`);
    if (summary.pozicija102_pdv10 > 0) lines.push(`D|102|${summary.pozicija102_pdv10}`);
    if (summary.pozicija003_oslobodjenSaPravom > 0) lines.push(`D|003|${summary.pozicija003_oslobodjenSaPravom}`);
    
    // Polje 110 je zbir obračunatog PDV-a (101 + 102)
    const ukupnoObracunato = summary.pozicija101_pdv20 + summary.pozicija102_pdv10;
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
