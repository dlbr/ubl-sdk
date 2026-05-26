import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NbsSoapService, NbsEnv } from '../../shared/services/nbsSoapService';

describe('🛡️ NBS SOAP & D1 Cache — Hirurški Audit Poreskog Kursa', () => {
  
  // Lažni env sa mock-ovanim Cloudflare D1 metodama
  let mockEnv: NbsEnv;
  let mockDbRows: Array<{ valuta: string; datum: string; kurs: number }> = [];

  beforeEach(() => {
    // Resetujemo in-memory keš pre svakog testa da nam testovi budu izolovani
    (NbsSoapService as any).memoryCache.clear();
    
    // Resetujemo lažnu bazu podataka
    mockDbRows = [];

    // Sklapanje Fluent API-ja za simulaciju Cloudflare D1 baze
    mockEnv = {
      NBS_USERNAME: 'test_user',
      NBS_PASSWORD: 'test_password',
      NBS_LICENCE_ID: 'test_licence',
      REGISTAR_DB: {
        prepare: vi.fn().mockImplementation((sql: string) => {
          return {
            bind: vi.fn().mockImplementation((...args: any[]) => {
              return {
                // Simulacija .first() metode (čitanje iz baze)
                first: vi.fn().mockImplementation(async () => {
                  // Normalizacija SQL stringa za lakše poređenje
                  const normalizedSql = sql.replace(/\s+/g, ' ').trim();
                  
                  if (normalizedSql.includes('SELECT kurs FROM nbs_kursna_lista_cache WHERE valuta = ? AND datum = ?')) {
                    const [valuta, datum] = args;
                    return mockDbRows.find(r => r.valuta === valuta && r.datum === datum) || null;
                  }
                  if (normalizedSql.includes('ORDER BY datum DESC LIMIT 1')) {
                    const [valuta] = args;
                    const sorted = [...mockDbRows]
                      .filter(r => r.valuta === valuta)
                      .sort((a, b) => b.datum.localeCompare(a.datum));
                    return sorted[0] || null;
                  }
                  return null;
                }),
                // Simulacija .run() metode (upis u bazu)
                run: vi.fn().mockImplementation(async () => {
                  const normalizedSql = sql.replace(/\s+/g, ' ').trim();
                  if (normalizedSql.includes('INSERT INTO nbs_kursna_lista_cache')) {
                    const [valuta, datum, kurs] = args;
                    mockDbRows.push({ valuta, datum, kurs });
                  }
                  return { success: true };
                })
              };
            })
          };
        })
      }
    };
  });

  it('1. Hladan start (Mreža) - Povlači sa API-ja i kešira u D1 bazu', async () => {
    const mockSoapXml = `<?xml version="1.0" encoding="utf-8"?>
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <GetExchangeRateByCurrencyResponse xmlns="http://communicationoffice.nbs.rs">
          <GetExchangeRateByCurrencyResult>117.2500</GetExchangeRateByCurrencyResult>
        </GetExchangeRateByCurrencyResponse>
      </soap:Body>
    </soap:Envelope>`;

    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(mockSoapXml, { status: 200, headers: { 'Content-Type': 'text/xml' } }))
    );

    const rate = await NbsSoapService.getMiddleRate('EUR', '2026-05-26', mockEnv);

    expect(rate).toBe(117.25);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(mockDbRows).toHaveLength(1);
    expect(mockDbRows[0]).toEqual({ valuta: 'EUR', datum: '2026-05-26', kurs: 117.25 });
  });

  it('2. Topli start (Keš iz baze) - Ako baza ima podatak za danas, mreža miruje', async () => {
    mockDbRows.push({ valuta: 'EUR', datum: '2026-05-26', kurs: 117.2031 });

    globalThis.fetch = vi.fn().mockImplementation(() => 
       Promise.resolve(new Response('OK', { status: 200 }))
    );

    const rate = await NbsSoapService.getMiddleRate('EUR', '2026-05-26', mockEnv);

    expect(rate).toBe(117.2031);
    expect(globalThis.fetch).toHaveBeenCalledTimes(0);
  });

  it('3. Dinamički Fallback - Ako NBS API padne, povlači poslednji poznati istorijski kurs', async () => {
    mockDbRows.push({ valuta: 'EUR', datum: '2026-05-25', kurs: 117.18 });

    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response('Internal Server Error', { status: 500 }))
    );

    const rate = await NbsSoapService.getMiddleRate('EUR', '2026-05-26', mockEnv);

    expect(rate).toBe(117.18);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
