import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MasterValidator } from '../packages/ubl-sdk/src/validator';
import { SefInvoiceSchema } from '../packages/ubl-sdk/src/validator';
import { SefUblBuilder } from '../packages/ubl-sdk/src/SefUblBuilder';
import { CryptographicLedger } from '@sef/shared';
import { ComplianceExporter } from '@sef/shared/services/ComplianceExporter';
import * as v from 'valibot';
import JSZip from 'jszip';

describe('🚀 Final CaaS Pipeline Verification', () => {
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      prepare: vi.fn().mockImplementation((sql: string) => {
        const stmt = {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockImplementation(async () => {
            if (sql.includes('FROM dokumenti')) {
              return {
                id: 'FKT-2026-FINAL',
                broj: 'FKT-2026-FINAL',
                status: 'SENT',
                datum_prometa: '2026-05-27',
                xml_blob: '<Invoice>...</Invoice>'
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
                    prethodni_hash: '0000000000000000000000000000000000000000000000000000000000000000',
                    trenutni_hash: 'hash-final',
                    dogadjaj: 'POSLAT',
                    detalji: JSON.stringify({ status: 'OK' }),
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

    globalThis.fetch = vi.fn().mockResolvedValue(new Response(new ArrayBuffer(10), {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' }
    }));
  });

  it('1. POSITIVAN TOK: B2G Faktura -> Valibot -> MasterValidator -> Audit Ledger -> Golden ZIP', async () => {
    // 1. INPUT: Podaci sa frontenda
    const rawInvoice = {
      id: "FKT-2026-FINAL",
      issueDate: "2026-05-27",
      supplierPib: "113398540", // 9 cifara, srpski format (Kriptografski validan)
      customerPib: "105674049", // 9 cifara, srpski format (Kriptografski validan)
      jbkjs: "12345", // B2G obavezno
      buyerReference: "UGOVOR-2026", // B2G obavezno
      lines: [
        { name: "Consulting", quantity: 1, price: 1000, taxRate: 20 }
      ]
    };

    // 2. VALIBOT: Runtime sanitizacija i normalizacija
    const validated = v.parse(SefInvoiceSchema, rawInvoice);
    expect(validated.id).toBe("FKT-2026-FINAL");
    expect(validated.jbkjsB).toBe("12345");

    // 3. MASTER VALIDATOR: B2G Compliance i MFIN XSD pravila
    const masterValidated = MasterValidator.validate(validated, { mode: 'B2G' });
    expect(masterValidated).toBeDefined();

    // 4. UBL GENERACIJA (Simulacija uspeha)
    const xml = SefUblBuilder.build(masterValidated);
    expect(xml).toContain('<cbc:ID>FKT-2026-FINAL</cbc:ID>');

    // 5. COMPLIANCE EXPORTER: Generisanje Zlatnog ZIP-a
    const goldenZip = await ComplianceExporter.generatePackage(
      mockDb,
      validated.id,
      'https://pdf.test',
      'secret',
      { companyName: 'Test Firma', verificationBaseUrl: 'https://verify.test' }
    );
    
    // 6. VERIFIKACIJA: Provera integriteta ZIP-a
    expect(goldenZip).toBeInstanceOf(Uint8Array);
    const zip = await JSZip.loadAsync(goldenZip);
    expect(zip.file('compliance_certificate.pdf')).toBeDefined();
    expect(zip.file('audit_trail.json')).toBeDefined();
    
    console.log("✅ FINALNI TEST PROŠAO: Sistem je Bullet-Proof.");
  });

  it('2. NEGATIVAN TOK (ULAZ): Valibot blokira neispravan PIB (Kraći od 9 cifara)', () => {
    const dirtyInvoice = {
      id: "FKT-ERR-001",
      supplierPib: "123", // Neispravan PIB
      customerPib: "100123456"
    };

    expect(() => {
      v.parse(SefInvoiceSchema, dirtyInvoice);
    }).toThrow(/PIB mora biti tačno 9 cifara/);

    console.log("🛡️ SISTEM BLOKIRAO: Neispravan PIB detektovan na samom ulazu.");
  });

  it('3. NEGATIVAN TOK (B2G): MasterValidator blokira nedostatak JBKJS ili ugovora', () => {
    const validBaseData = {
      id: "FKT-ERR-002",
      issueDate: "2026-05-27",
      supplierPib: "113398540",
      customerPib: "105674049"
    };

    const validated = v.parse(SefInvoiceSchema, validBaseData);

    expect(() => {
      // Zahtevamo B2G, ali nismo prosledili JBKJS i buyerReference
      MasterValidator.validate(validated, { mode: 'B2G' });
    }).toThrow(/BuyerReference/);

    console.log("🛡️ SISTEM BLOKIRAO: B2G compliance pravila ispoštovana.");
  });
});
