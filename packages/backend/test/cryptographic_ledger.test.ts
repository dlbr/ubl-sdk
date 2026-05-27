import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CryptographicLedger, canonicalize, sha256 } from '@sef/shared/services/CryptographicLedger';

describe('🛡️ Cryptographic Ledger — Testiranje Revizorskog Traga', () => {
  let mockDb: any;
  let mockRecords: any[] = [];

  beforeEach(() => {
    mockRecords = [];
    mockDb = {
      prepare: vi.fn().mockImplementation((sql: string) => {
        const statement = {
          bind: vi.fn().mockImplementation((...args: any[]) => {
            return {
              first: vi.fn().mockImplementation(async () => {
                if (sql.includes('ORDER BY redosled DESC LIMIT 1')) {
                  return mockRecords[mockRecords.length - 1] || null;
                }
                return null;
              }),
              run: vi.fn().mockImplementation(async () => {
                if (sql.includes('INSERT INTO revizorski_trag')) {
                  const [redosled, prethodni_hash, trenutni_hash, dokument_id, dogadjaj, detalji, kreirano_u] = args;
                  mockRecords.push({ redosled, prethodni_hash, trenutni_hash, dokument_id, dogadjaj, detalji, kreirano_u });
                }
                return { success: true };
              }),
              all: vi.fn().mockImplementation(async () => {
                if (sql.includes('ORDER BY redosled ASC')) {
                  return { results: [...mockRecords] };
                }
                return { results: [] };
              })
            };
          })
        };
        // Takođe podržavamo direktan poziv bez bind-a ako je potrebno (npr. u verifyChain)
        (statement as any).all = async () => {
          if (sql.includes('ORDER BY redosled ASC')) {
            return { results: [...mockRecords] };
          }
          return { results: [] };
        };
        (statement as any).first = async () => {
          if (sql.includes('ORDER BY redosled DESC LIMIT 1')) {
            return mockRecords[mockRecords.length - 1] || null;
          }
          return null;
        };
        return statement;
      })
    };
  });

  it('1. Kanonikalizacija — Determinizam JSON ključeva', () => {
    const objA = { a: 1, b: 2, c: { d: 3, e: 4 } };
    const objB = { c: { e: 4, d: 3 }, b: 2, a: 1 };
    
    expect(canonicalize(objA)).toBe(canonicalize(objB));
    expect(canonicalize(objA)).toBe('{"a":1,"b":2,"c":{"d":3,"e":4}}');
  });

  it('2. Append & Verify — Lanac se ispravno gradi i verifikuje', async () => {
    await CryptographicLedger.appendEvent(mockDb, 'DOC-001', 'SENT', { status: 'OK' });
    await CryptographicLedger.appendEvent(mockDb, 'DOC-002', 'REJECTED', { reason: 'Test' });

    expect(mockRecords).toHaveLength(2);
    expect(mockRecords[1].prethodni_hash).toBe(mockRecords[0].trenutni_hash);

    const result = await CryptographicLedger.verifyChain(mockDb);
    expect(result.success).toBe(true);
  });

  it('3. Detekcija Tampering-a — Promena metapodataka lomi lanac', async () => {
    await CryptographicLedger.appendEvent(mockDb, 'DOC-001', 'SENT', { amount: 100 });
    
    // Simulacija neovlašćene promene u bazi (promena iznosa u detaljima)
    mockRecords[0].detalji = canonicalize({ amount: 999999 });

    const result = await CryptographicLedger.verifyChain(mockDb);
    expect(result.success).toBe(false);
    expect(result.tamperedIndex).toBe(1);
    expect(result.message).toContain('Detektovana neovlašćena promena');
  });

  it('4. Detekcija Brisanja — Prekid sekvence lomi lanac', async () => {
    await CryptographicLedger.appendEvent(mockDb, 'DOC-001', 'SENT', {});
    await CryptographicLedger.appendEvent(mockDb, 'DOC-002', 'SENT', {});
    await CryptographicLedger.appendEvent(mockDb, 'DOC-003', 'SENT', {});

    // Simulacija brisanja srednjeg reda
    mockRecords.splice(1, 1);

    const result = await CryptographicLedger.verifyChain(mockDb);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Detektovano brisanje unosa');
  });

  it('5. Detekcija Hash-Breaking-a — Promena prethodnog heša lomi lanac', async () => {
    await CryptographicLedger.appendEvent(mockDb, 'DOC-001', 'SENT', {});
    await CryptographicLedger.appendEvent(mockDb, 'DOC-002', 'SENT', {});

    // Menjamo heš prvog reda, ali ne i prethodni_hash drugog reda
    mockRecords[0].trenutni_hash = 'tampered-hash';

    const result = await CryptographicLedger.verifyChain(mockDb);
    expect(result.success).toBe(false);
    expect(result.tamperedIndex).toBe(1); // Puca već na prvom jer se trenutni ne poklapa sa kalkulacijom
  });
});
