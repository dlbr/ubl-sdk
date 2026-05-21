import { SefUblBuilder } from '../packages/sef-ubl-builder/src/index.js';

const API_KEY = process.env.STAGING_SEF_API_KEY;
const PIB_PRODAVCA = '102345678';
const PIB_KUPCA = '100000032';

async function posaljiFakturuSest() {
  if (!API_KEY) {
    console.error("Nedostaje API ključ!");
    return;
  }

  const xml = SefUblBuilder.buildStandardna({
    broj: '6', 
    pibProdavca: PIB_PRODAVCA,
    pibKupca: PIB_KUPCA,
    osnovica: 1000.00,
    pdv: 200.00,
    poreskaKategorija: 'S',
    pdvStopa: 20.00
  });

  console.log(`📡 Šaljem fakturu br. 6 na državni SEF...`);

  const res = await fetch('https://demosef.mfin.gov.rs/api/publicApi/sales-invoice/ubl', {
    method: 'POST',
    headers: {
      'ApiKey': API_KEY,
      'Content-Type': 'application/xml',
      'Accept': 'application/json'
    },
    body: xml
  });

  const body = await res.text();
  console.log(`Status: ${res.status}`);
  console.log(`Odgovor: ${body}`);
}

posaljiFakturuSest();
