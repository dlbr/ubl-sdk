import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComplianceCertificateBuilder, CryptographicLedger, hmac } from '@sef/shared';
import { ComplianceExporter } from '@sef/shared/services/ComplianceExporter';
import JSZip from 'jszip';

describe('🚀 Compliance E2E — Putanja Revizorskog Traga', () => {
  let mockDb: any;

  beforeEach(async () => {
    const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
    const mockDetails = { status: 'OK' };
    const correctHash = await CryptographicLedger.calculateHash(1, GENESIS_HASH, 'DOC-123', 'POSLAT', mockDetails);

    mockDb = {
      prepare: vi.fn().mockImplementation((sql: string) => {
        const stmt = {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockImplementation(async () => {
            if (sql.includes('FROM dokumenti')) {
              return {
                id: 'DOC-123',
                broj: 'FKT-2026-01',
                status: 'SENT',
                datum_prometa: '2026-05-27',
                xml_blob: '<UBLInvoice>...</UBLInvoice>'
              };
            }
            return null;
          }),
          all: vi.fn().mockImplementation(async () => {
            if (sql.includes('FROM revizorski_trag')) {
              return {
                results: [
                  {
                    redosled: 1,
                    prethodni_hash: GENESIS_HASH,
                    trenutni_hash: correctHash,
                    dokument_id: 'DOC-123',
                    dogadjaj: 'POSLAT',
                    detalji: JSON.stringify(mockDetails),
                    kreirano_u: '2026-05-27T10:00:00Z'
                  }
                ]
              };
            }
            return { results: [] };
          })
        };
        return stmt;
      })
    };

    // Mock fetch za PDF servis
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(new ArrayBuffer(10), {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' }
    }));
  });

  it('Trebalo bi da generiše potpun ZIP paket sa potpisanim PDF sertifikatom', async () => {
    const zipData = await ComplianceExporter.generatePackage(
      mockDb,
      'DOC-123',
      'https://pdf-service.test/gen',
      'test-secret-key',
      {
        companyName: 'Test Firma d.o.o.',
        verificationBaseUrl: 'https://sef.dlbr.test'
      }
    );

    expect(zipData).toBeInstanceOf(Uint8Array);
    
    // Verifikacija sadržaja ZIP-a
    const zip = await JSZip.loadAsync(zipData);
    expect(zip.file('faktura_FKT-2026-01.xml')).toBeDefined();
    expect(zip.file('metadata.json')).toBeDefined();
    expect(zip.file('audit_trail.json')).toBeDefined();
    expect(zip.file('compliance_certificate.pdf')).toBeDefined();

    // Verifikacija audit trail sadržaja
    const trail = JSON.parse(await zip.file('audit_trail.json')?.async('text') || '{}');
    expect(trail.verification.success).toBe(true);
    expect(trail.history[0].hash).toBeTypeOf('string');
    expect(trail.history[0].hash).toHaveLength(64);

    // Verifikacija fetch poziva (da li je potpisan?)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://pdf-service.test/gen',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Signature': expect.any(String),
          'X-Timestamp': expect.any(String)
        })
      })
    );
  });
});
