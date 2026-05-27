import { it } from 'vitest';
import fs from 'fs';
import path from 'path';

it('debug filesystem', () => {
  const root = '/Users/dlbr/labs/sef';
  const p = path.join(root, 'packages/ubl-sdk/schemas/maindoc/UBL-Invoice-2.1.xsd');
  
  console.log('Exists:', fs.existsSync(p));
  console.log('Root dir:', fs.readdirSync(root));
  console.log('Packages dir:', fs.readdirSync(path.join(root, 'packages')));
  console.log('UBL dir:', fs.readdirSync(path.join(root, 'packages/ubl-sdk')));
  console.log('Schemas dir:', fs.readdirSync(path.join(root, 'packages/ubl-sdk/schemas')));
});
