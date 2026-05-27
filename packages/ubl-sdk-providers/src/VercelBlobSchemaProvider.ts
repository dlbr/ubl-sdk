import { SchemaProvider } from '@dlbr/ubl-sdk';

export class VercelBlobSchemaProvider implements SchemaProvider {
  constructor(private blobClient: any) {}

  async getSchema(schemaPath: string): Promise<string | null> {
    try {
      // Vercel Blob storage (npr. list + find ili direktan URL ako je poznat)
      const blob = await this.blobClient.get(schemaPath);
      if (!blob) return null;
      return await blob.text();
    } catch (error) {
      console.error(`[VercelBlobSchemaProvider] Greška pri čitanju šeme: ${schemaPath}`, error);
      return null;
    }
  }
}
