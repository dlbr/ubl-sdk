# @dlbr/ubl-sdk-providers

Platform-specific storage adapters for `@dlbr/ubl-sdk` XSD validation.

## Available Providers

- `CloudflareKVSchemaProvider`: Fetch schemas from Cloudflare KV.
- `FileSystemSchemaProvider`: Read schemas from local disk (Node.js).
- `AwsS3SchemaProvider`: Fetch schemas from AWS S3.
- `VercelBlobSchemaProvider`: Fetch schemas from Vercel Blob storage.

## Usage

```typescript
import { MasterValidator } from '@dlbr/ubl-sdk';
import { CloudflareKVSchemaProvider } from '@dlbr/ubl-sdk-providers';

const provider = new CloudflareKVSchemaProvider(env.COMPLIANCE_KV);
const result = await MasterValidator.validateAgainstXSD(xml, provider);
```
