import fs from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * SEF Registry Bulk Importer
 * Koristi wrangler CLI za direktan uvoz u D1 bazu, zaobilazeći Edge limite.
 */

const FILE_PATH = './companies.json';
const DATABASE_NAME = 'sef_centralni_registar';
const BATCH_SIZE = 100; // Smanjen batch zbog SQLITE_TOOBIG limita

async function run() {
  console.log('🚀 Započinjem masovni uvoz kompanija u D1...');

  if (!fs.existsSync(FILE_PATH)) {
    console.error(`❌ Fajl ${FILE_PATH} ne postoji. Prvo preuzmite podatke sa SEF-a.`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(FILE_PATH, 'utf8');
  const companies = JSON.parse(rawData);
  console.log(`📦 Učitano ${companies.length} zapisa iz fajla.`);

  for (let i = 0; i < companies.length; i += BATCH_SIZE) {
    const chunk = companies.slice(i, i + BATCH_SIZE);
    
    let sql = `INSERT INTO sef_kompanije (pib, maticni_broj, naziv_firme, status, azurirano_at) VALUES \n`;
    const values = chunk.map(c => {
      // Čišćenje i sanitizacija podataka
      const pib = String(c.VatRegistrationCode || c.pib || '').replace(/[^0-9]/g, '');
      const mb = String(c.RegistrationCode || c.maticniBroj || '').trim().replace(/'/g, "''");
      const name = String(c.Name || c.naziv || 'Nepoznata Firma').trim().replace(/'/g, "''").substring(0, 255);
      const status = String(c.Status || 'Active').trim().replace(/'/g, "''");
      
      return `('${pib}', '${mb}', '${name}', '${status}', strftime('%s', 'now'))`;
    }).join(',\n');

    sql += values + `\n ON CONFLICT(pib) DO UPDATE SET 
      naziv_firme = excluded.naziv_firme, 
      maticni_broj = excluded.maticni_broj, 
      status = excluded.status, 
      azurirano_at = excluded.azurirano_at
    WHERE (naziv_firme IS NOT excluded.naziv_firme OR maticni_broj IS NOT excluded.maticni_broj OR status IS NOT excluded.status);`;

    fs.writeFileSync('temp_chunk.sql', sql);
    
    try {
      execSync(`npx wrangler d1 execute ${DATABASE_NAME} --remote --file=temp_chunk.sql --yes`, { stdio: 'inherit' });
      console.log(`✅ Procesirano: ${i + chunk.length} / ${companies.length}`);
    } catch (err) {
      console.error(`❌ Greška u batch-u kod indeksa ${i}. Smanjujem batch ili preskačem...`);
    }
  }

  if (fs.existsSync('temp_chunk.sql')) fs.unlinkSync('temp_chunk.sql');
  console.log('🏁 Uvoz završen!');
}

run();
