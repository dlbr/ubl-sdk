import { SchemaProvider } from '@dlbr/ubl-sdk';

export class StaticSchemaProvider implements SchemaProvider {
  constructor(private schemas: Record<string, string>) {}

  async getSchema(schemaPath: string): Promise<string | null> {
    return this.schemas[schemaPath] || null;
  }
}
