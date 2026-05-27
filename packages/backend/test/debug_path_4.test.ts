import { it } from 'vitest';
import fs from 'fs';
import path from 'path';

it('debug path', () => {
  const p = '/Users/dlbr/labs/sef/packages/ubl-sdk/schemas/maindoc/UBL-Invoice-2.1.xsd';
  console.log('Absolute Check:', fs.existsSync(p));
  console.log('Realpath:', fs.realpathSync(p));
});
