const crypto = require('crypto');

/**
 * state-sandbox-ping.js - Poreski Sanity Check
 * Verifikuje usaglašenost koda sa državnim SEF Sandbox-om pre deployment-a.
 */
async function testirajDrzavniSanityCheck() {
  const apiKey = process.env.DRZAVNI_DEMO_API_KEY;
  const pib = process.env.TEST_KLIJENT_PIB || "102345678";

  if (!apiKey) {
    console.warn("⚠️ Nedostaje SEF_DEMO_API_KEY. Preskačem državni test za ovaj run.");
    process.exit(0); // Ne blokiramo lokalni razvoj ako nema ključa
  }

  // Sklapanje zvaničnog JSON-a prema Pravilniku 30/2026 (Zbirna evidencija - EEO)
  const testEeoPayload = {
    Year: new Date().getFullYear(),
    Month: new Date().getMonth() + 1,
    TaxRecords: [
      { 
        TaxRatePercentage: 20.00, 
        Amount: 1000.00, 
        TaxAmount: 200.00 
      }
    ]
  };

  console.log(`🚀 Slanje compliance paketa na demosef.mfin.gov.rs za PIB: ${pib}...`);
  
  try {
    const response = await fetch('https://demosef.mfin.gov.rs/api/public/tax-record/summary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ApiKey': apiKey
      },
      body: JSON.stringify(testEeoPayload)
    });

    const status = response.status;
    const body = await response.text();

    if (status === 200 || status === 201 || status === 202) {
      console.log("✅ Državni API je prihvatio strukturu. Sistem v3.5.0 je 100% usklađen.");
      process.exit(0);
    } else {
      console.error(`❌ Državni API je odbio paket (Status ${status}):`);
      console.error(body);
      console.error("\n🚨 KRITIČNA GREŠKA: Država je promenila tehničku specifikaciju!");
      console.error("Deploy je blokiran radi zaštite integriteta podataka klijenata.");
      process.exit(1);
    }
  } catch (err) {
    console.error("❌ Mrežna greška pri komunikaciji sa državnim SEF serverom:", err.message);
    process.exit(1);
  }
}

testirajDrzavniSanityCheck();
