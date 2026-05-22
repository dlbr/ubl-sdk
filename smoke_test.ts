import { SefUblBuilder } from './packages/sef-ubl-builder/src/index.ts';

async function smokeTest() {
  console.log("🚀 Pokrećem forenzički Smoke Test...");
  
  // Napomena: Ovo možda neće raditi zbog .ts ekstenzije u node direktno. 
  // Ako ne radi, koristićemo builder iz src/index.ts direktno.
  const xml = SefUblBuilder.build({
    broj: 'SMOKE-TEST-' + Date.now(),
    pibProdavca: '113398540',
    pibKupca: '105674049',
    osnovica: 1000,
    pdv: 200,
    poreskaKategorija: 'S',
    item_name: 'Forenzički Smoke Test',
    datumIzdavanja: '2026-05-22',
    datumDospeca: '2026-05-22',
    datumPrometa: '2026-05-22'
  });

  console.log('XML spreman, dužina:', xml.length);

  const response = await fetch('https://demoefaktura.mfin.gov.rs/api/publicApi/sales-invoice/ubl?requestId=' + Date.now(), {
    method: 'POST',
    headers: { 
      'ApiKey': process.env.STAGING_SEF_API_KEY, 
      'Content-Type': 'application/xml',
      'Accept': 'application/json'
    },
    body: xml
  });

  const body = await response.text();
  console.log('Status:', response.status);
  console.log('Rezultat:', body);

  if (response.status !== 201 && response.status !== 200) {
    console.error(`❌ Smoke Test nije uspeo! SEF je vratio status ${response.status}`);
    process.exit(1);
  }
  
  console.log("✅ Smoke Test USPEŠAN.");
}

smokeTest().catch(console.error);
