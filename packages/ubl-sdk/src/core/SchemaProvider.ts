export interface SchemaProvider {
  getSchema(schemaPath: string): Promise<string | null>;
}
