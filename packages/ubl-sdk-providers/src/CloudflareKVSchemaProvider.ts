import { SchemaProvider } from '@dlbr/ubl-sdk';

export class CloudflareKVSchemaProvider implements SchemaProvider {
  constructor(private kvNamespace: any) {}

  async getSchema(schemaPath: string): Promise<string | null> {
    try {
      // Očekujemo da su šeme u KV bazi pod ključem koji odgovara putanji
      return await this.kvNamespace.get(schemaPath);
    } catch (error) {
      console.error(`[CloudflareKVSchemaProvider] Greška pri čitanju šeme iz KV: ${schemaPath}`, error);
      return null;
    }
  }
}
