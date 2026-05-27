import { SchemaProvider } from '../core/SchemaProvider.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export class FileSystemSchemaProvider implements SchemaProvider {
  constructor(private basePath: string) {}

  async getSchema(schemaPath: string): Promise<string | null> {
    try {
      const fullPath = path.join(this.basePath, schemaPath);
      return await fs.readFile(fullPath, 'utf8');
    } catch (error) {
      console.error(`[FileSystemSchemaProvider] Greška pri čitanju šeme: ${schemaPath}`, error);
      return null;
    }
  }
}
