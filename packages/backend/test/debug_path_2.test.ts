import { it } from 'vitest';
import fs from 'fs';
import path from 'path';

it('debug path', () => {
  const root = process.cwd();
  const dir = path.join(root, 'packages/ubl-sdk/schemas/maindoc');
  console.log('Dir exists:', fs.existsSync(dir));
  console.log('Dir content:', fs.readdirSync(dir));
  const file = path.join(dir, 'UBL-Invoice-2.1.xsd');
  console.log('File exists:', fs.existsSync(file));
});
