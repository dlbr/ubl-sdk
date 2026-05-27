import { SchemaProvider } from '@dlbr/ubl-sdk';

export class AwsS3SchemaProvider implements SchemaProvider {
  constructor(private s3Client: any, private bucketName: string) {}

  async getSchema(schemaPath: string): Promise<string | null> {
    try {
      // Satori / Web environment compatible fetch-based S3 or SDK call
      const response = await this.s3Client.send({
        Bucket: this.bucketName,
        Key: schemaPath
      });
      return await response.Body.transformToString();
    } catch (error) {
      console.error(`[AwsS3SchemaProvider] Greška pri čitanju šeme: ${schemaPath}`, error);
      return null;
    }
  }
}
