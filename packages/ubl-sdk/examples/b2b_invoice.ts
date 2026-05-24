import { SefUblBuilder } from '../src/index.js';

/**
 * Example: Building a standard B2B invoice (Tip 380)
 */
async function generateB2bInvoice() {
  const invoiceData = {
    broj: "F-2026-0001",
    pibProdavca: "100000001",
    pibKupca: "200000002",
    nazivProdavca: "MOJA FIRMA DOO",
    nazivKupca: "PARTNER FIRMA DOO",
    maticniBrojProdavca: "20456789",
    maticniBrojKupca: "20987654",
    adresaProdavca: "Ulica 1",
    gradProdavca: "Beograd",
    postanskiBrojProdavca: "11000",
    adresaKupca: "Ulica 2",
    gradKupca: "Novi Sad",
    postanskiBrojKupca: "21000",
    datumIzdavanja: "2026-05-24",
    datumPrometa: "2026-05-24",
    valuta: "RSD",
    osnovica: 10000.00,
    pdv: 2000.00,
    poreskaKategorija: "S",
    pdvStopa: 20,
    note: "Hvala na saradnji!"
  };

  try {
    // build() will automatically call MasterValidator
    const xml = SefUblBuilder.build(invoiceData);
    console.log("--- GENERATED UBL 2.1 XML ---");
    console.log(xml);
  } catch (error) {
    console.error("Compliance Error:", (error as Error).message);
  }
}

generateB2bInvoice();
