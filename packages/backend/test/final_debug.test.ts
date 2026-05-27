import { it } from 'vitest';
import fs from 'fs';
import path from 'path';

it('debug path', () => {
  const relPath = '../../../packages/ubl-sdk/schemas/maindoc/UBL-Invoice-2.1.xsd';
  const p = path.resolve(__dirname, relPath);
  console.log('Absolute path:', p);
  console.log('Exists:', fs.existsSync(p));
});
