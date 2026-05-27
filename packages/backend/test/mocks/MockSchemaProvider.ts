import { SchemaProvider } from '@dlbr/ubl-sdk';

export class MockSchemaProvider implements SchemaProvider {
  async getSchema(schemaPath: string): Promise<string> {
    return '<?xml version="1.0" encoding="UTF-8"?><xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="Invoice" type="xs:string"/></xs:schema>';
  }
}
