import { SchemaProvider } from '@dlbr/ubl-sdk';

export class CloudflareKVSchemaProvider implements SchemaProvider {
  constructor(private kvNamespace: any) {}

  async getSchema(schemaPath: string): Promise<string | null> {
    try {
      // 🛡️ Security Hardening: Prevent directory traversal
      const safePath = schemaPath.replace(/\.\.\//g, '').replace(/^\/+/, '');
      
      return await this.kvNamespace.get(safePath);
    } catch (error) {
      console.error(`[CloudflareKVSchemaProvider] Greška pri čitanju šeme iz KV: ${schemaPath}`, error);
      return null;
    }
  }
}
