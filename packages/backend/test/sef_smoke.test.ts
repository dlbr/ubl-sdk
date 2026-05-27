import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MasterValidator, XmlTransformer } from '@dlbr/ubl-sdk';
import { MockSchemaProvider } from './mocks/MockSchemaProvider';
import path from 'path';
import { sefServer } from './mocks/sef-api';

describe('🚀 SEF Bridge Integration Smoke Test', () => {
  const provider = new MockSchemaProvider();
  const schemaPath = 'maindoc/UBL-Invoice-2.1.xsd';

  beforeAll(() => {
    sefServer.listen();
  });

  afterAll(() => {
    sefServer.close();
  });

  it('treba da obradi kompletan put fakture od JSON-a do SEF-a', async () => {
    // 1. INPUT
    const rawData = {
      id: 'FKT-SMOKE-001',
      issueDate: '2026-05-27',
      supplierPib: '113398540',
      customerPib: '105674049',
      mode: 'B2B',
      lines: [
        { id: '1', name: 'Test usluga', quantity: 1, unitPrice: 100, taxRate: 20, unitCode: 'H87', taxCategory: 'S' }
      ]
    };

    // 2. VALIDACIJA i TRANSFORMACIJA
    const validated = MasterValidator.validate(rawData);
    expect(validated).toBeDefined();

    // 3. XML Transformacija (kroz SDK)
    const xml = XmlTransformer.toUblXml(validated as any);

    // 4. Integraciona verifikacija
    const isXmlValid = await MasterValidator.validateAgainstXSD(xml, provider, schemaPath);
    expect(isXmlValid).toBe(true);

    // 5. MOCK SEF POZIV (koristi msw server)
    const sefResponse = await fetch('https://demoefaktura.mfin.gov.rs/api/v1/faktura', { method: 'POST', body: xml });
    const sefData = await sefResponse.json();

    expect(sefResponse.status).toBe(202);
    expect(sefData.id).toContain('SEF-SIMULATED-ID');

    console.log(`🎯 [SMOKE-TEST] USPEH. SEF ID: ${sefData.id}`);
  });
});

