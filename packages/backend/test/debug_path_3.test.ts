import { it } from 'vitest';
import fs from 'fs';
import path from 'path';

it('debug path', () => {
  const p = path.resolve(__dirname, '../../../packages/ubl-sdk/schemas/maindoc/UBL-Invoice-2.1.xsd');
  console.log('Path:', p);
  console.log('Exists:', fs.existsSync(p));
});
