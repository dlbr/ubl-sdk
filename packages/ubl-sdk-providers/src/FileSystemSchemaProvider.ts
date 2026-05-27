import { SchemaProvider } from '@dlbr/ubl-sdk';
import * as fs from 'fs/promises';
import * as path from 'path';

export class FileSystemSchemaProvider implements SchemaProvider {
  constructor(private basePath: string) {}

  async getSchema(schemaPath: string): Promise<string | null> {
    try {
      const fullPath = path.join(this.basePath, schemaPath);
      console.log(`[FileSystemSchemaProvider] Pokušavam učitati: ${fullPath}`);
      return await fs.readFile(fullPath, 'utf8');
    } catch (error) {
      console.error(`[FileSystemSchemaProvider] Greška pri čitanju šeme: ${schemaPath}. Pokušao: ${path.join(this.basePath, schemaPath)}`, error);
      return null;
    }
  }
}
