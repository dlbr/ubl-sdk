import fs from 'fs';

async function syncBlacklist() {
  console.log("📥 Preuzimanje liste neaktivnih firmi...");
  const response = await fetch('https://efaktura.gov.rs/extfile/sr/list/spisak_firmi2.csv');
  if (!response.ok) throw new Error("Neuspešno preuzimanje CSV-a");
  
  const csvText = await response.text();
  
  // Nativni parser: Splituj po linijama, uzmi prvu kolonu (PIB), ignoriši header i validiraj
  const pibs = csvText
    .split('\n')
    .slice(1) // Preskoči header
    .map(line => line.split(',')[0].trim()) // Uzmi PIB iz prve kolone
    .filter(pib => /^\d{9}$/.test(pib)); // Validacija 9 cifara
  
  console.log(`✅ Parsirano ${pibs.length} neaktivnih firmi. Ažuriram lokalnu bazu...`);
  
  // Normalizujemo listu u string za SQL query
  const pibList = pibs.map(p => `'${p}'`).join(',');
  
  console.log(`SQL: UPDATE klijenti SET status = 'INACTIVE' WHERE SUBSTR(klijent_id, 9) IN (${pibList});`);
}

syncBlacklist().catch(err => {
    console.error(err);
    process.exit(1);
});