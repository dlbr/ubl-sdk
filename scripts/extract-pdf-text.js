import fs from 'fs';
import https from 'https';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfModule = require('pdf-parse');
const pdf = pdfModule.PDFParse || pdfModule;

async function downloadAndExtract() {
  const url = process.argv[2];
  if (!url) {
    console.error('URL is required');
    process.exit(1);
  }

  const tmpFile = '/tmp/sef_hotfix.pdf';
  
  console.log(`Downloading PDF from ${url}...`);
  
  const file = fs.createWriteStream(tmpFile);
  https.get(url, (response) => {
    response.pipe(file);
    file.on('finish', async () => {
      file.close();
      console.log('Download complete. Extracting text...');
      
      try {
        const dataBuffer = fs.readFileSync(tmpFile);
        
        // If pdf is a class constructor, instantiate it.
        // The error 'Class constructors cannot be invoked without new' means it MUST be newed.
        const parser = new pdf(dataBuffer);
        const data = await parser.parse();
        
        console.log(data.text);
      } catch (err) {
        console.error('PDF Extraction failed:', err);
        process.exit(1);
      }
    });
  }).on('error', (err) => {
    fs.unlink(tmpFile, () => {});
    console.error('Download failed:', err.message);
    process.exit(1);
  });
}

downloadAndExtract();