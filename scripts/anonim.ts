import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';
import * as FXB from 'fast-xml-builder';

const SENSITIVE_TAGS = new Set([
  'cbc:CompanyID',
  'cbc:RegistrationName',
  'cbc:StreetName',
  'cbc:EndpointID',
  'cbc:ID', // OPREZ: Ovo će maskirati i ID fakture!
  'cbc:Name'
]);

function anonimizuj(obj: any): any {
  if (typeof obj !== 'object' || obj === null) return obj;
  for (const key in obj) {
    console.log(`🔍 Pronađen tag: ${key}`); // DODAJ OVO
    if (SENSITIVE_TAGS.has(key)) {
      obj[key] = '***ANONIMIZOVANO***';
    } else {
      anonimizuj(obj[key]);
    }
  }
  return obj;
}

function processFolder() {
  const dir = 'docs/raw';
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.xml') && !f.includes('anonimna'));

  files.forEach(file => {
    console.log(`🔍 Obrađujem: ${file}`);
    const xmlData = fs.readFileSync(path.join(dir, file), 'utf8');

    const parser = new XMLParser({ ignoreAttributes: false });
    let jsonObj = parser.parse(xmlData);

    anonimizuj(jsonObj);

    const BuilderClass = (FXB as any).XMLBuilder || (FXB as any).default || FXB;
    const builder = new BuilderClass({
      ignoreAttributes: false,
      format: true,
      suppressEmptyNode: true
    });
    const outputName = file.replace('.xml', '_anonimna.xml');

    fs.writeFileSync(path.join(dir, outputName), builder.build(jsonObj));
    console.log(`✅ Kreirano: ${outputName}`);
  });
}

processFolder();