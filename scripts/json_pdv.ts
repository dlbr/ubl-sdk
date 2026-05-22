import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

const TARGET_URL = 'https://www.efaktura.gov.rs/tekst/4092/primeri-json-fajlova-za-pojedinacne-evidencije-obracuna-pdv.php';
const TARGET_DIR = path.join('docs', 'pojedinacna_evidencija_pdv');

async function downloadAll() {
  const response = await fetch(TARGET_URL);
  const html = await response.text();

  // Regex pronalazi sve linkove ka view_file.php i odgovarajuće naslove
  const regex = /view_file\.php\?file_id=(\d+)[^"]+"[^>]+title="([^"]+)"/g;
  const matches = [...html.matchAll(regex)];

  if (!fs.existsSync(TARGET_DIR)) fs.mkdirSync(TARGET_DIR, { recursive: true });

  console.log(`Pronađeno ${matches.length} fajlova. Preuzimam...`);

  for (const match of matches) {
    const fileId = match[1];
    const rawTitle = match[2];
    
    // Čišćenje naziva fajla (uklanjanje nedozvoljenih znakova za fajl sistem)
    const fileName = rawTitle.replace(/[\/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_') + '.json';
    const downloadUrl = `https://www.efaktura.gov.rs/view_file.php?file_id=${fileId}&cache=sr`;

    const fileRes = await fetch(downloadUrl);
    if (fileRes.ok) {
      await pipeline(fileRes.body, fs.createWriteStream(path.join(TARGET_DIR, fileName)));
      console.log(`Uspešno preuzet: ${fileName}`);
    }
  }
}

downloadAll();