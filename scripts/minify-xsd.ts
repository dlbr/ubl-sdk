import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_ROOT = path.join(__dirname, '../schemas');
const OUTPUT_ROOT = path.join(__dirname, '../dist-schemas');

function minifyXml(content: string): string {
  return content
    .replace(/<!--[\s\S]*?-->/g, '') // Remove comments
    .replace(/>\s+</g, '><')         // Remove whitespace between tags
    .replace(/\s+/g, ' ')            // Collapse multiple spaces
    .trim();
}

function processDirectory(dir: string) {
  const fullPath = path.join(SCHEMA_ROOT, dir);
  const outPath = path.join(OUTPUT_ROOT, dir);

  if (!fs.existsSync(outPath)) {
    fs.mkdirSync(outPath, { recursive: true });
  }

  const files = fs.readdirSync(fullPath);

  for (const file of files) {
    const filePath = path.join(fullPath, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      processDirectory(path.join(dir, file));
    } else if (file.endsWith('.xsd')) {
      console.log(`✂️ Minifying ${file}...`);
      const content = fs.readFileSync(filePath, 'utf8');
      const minified = minifyXml(content);
      fs.writeFileSync(path.join(outPath, file), minified);
    }
  }
}

console.log('🚀 Starting XSD minification...');
processDirectory('.');
console.log('✨ Minification complete.');
