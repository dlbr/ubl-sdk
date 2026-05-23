import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import fs from 'fs';
import { parse } from 'csv-parse/sync';

async function syncBlacklist() {
  console.log("📥 Preuzimanje liste neaktivnih firmi...");
  const response = await fetch('https://efaktura.gov.rs/extfile/sr/list/spisak_firmi2.csv');
  const csvText = await response.text();
  
  // CSV parsiranje
  const records = parse(csvText, { skip_empty_lines: true });
  
  // Očekujemo da je PIB u prvoj koloni (index 0)
  const pibs = records.map(r => r[0]).filter(p => /^\d{9}$/.test(p));
  
  console.log(`✅ Parsirano ${pibs.length} neaktivnih firmi. Ažuriram lokalnu bazu...`);
  
  // Normalizujemo listu u string za SQL query
  const pibList = pibs.map(p => `'${p}'`).join(',');
  
  // Ovo bi u produkciji trebalo da poziva neki endpoint ili direktan D1 update
  // Ali pošto je ovo skripta, možemo pozvati neki lokalni API ili raditi direktan D1
  console.log(`SQL: UPDATE klijenti SET status = 'INACTIVE' WHERE SUBSTR(klijent_id, 9) IN (${pibList});`);
}

syncBlacklist().catch(console.error);
