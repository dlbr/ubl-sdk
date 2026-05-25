import { describe, it, expect, beforeEach, vi } from 'vitest';
import { app } from '../src/index';
import { DOZVOLE_PLAN_OVA } from '@sef/shared/types/sef';

const mockConfig = { value: {} };
const mockPotrošnja = { value: {} };

const kreirajMockContext = (klijentId: string, headers = {}) => {
  return {
    req: {
      url: 'https://internal/api/otpremnice/send',
      method: 'POST',
      headers: {
        get: (name: string) => {
          if (name.toLowerCase() === 'x-klijent-id') return klijentId;
          if (name.toLowerCase() === 'content-type') return 'application/json';
          return (headers as any)[name];
        }
      },
      json: async () => ({
        id: "OTPR-2026-001",
        issueDate: "2026-05-25",
        supplierPib: "113398540",
        customerPib: "223344556",
        lines: []
      })
    },
    env: {
      KLIJENT_BAZA_OBJECT: {
        idFromName: (name: string) => name,
        get: () => ({
          getConfig: async () => mockConfig.value,
          getMesečnaPotrošnja: async () => mockPotrošnja.value,
          fetch: async (req: Request) => {
            const url = new URL(req.url);
            if (url.pathname === '/config') return new Response(JSON.stringify(mockConfig.value));
            return new Response(JSON.stringify({ success: true }), { status: 202 });
          }
        })
      },
      REGISTAR_DB: { prepare: () => ({ bind: () => ({ first: async () => ({}) }) }) }
    },
    ctx: { waitUntil: () => {} }
  };
};

describe('🛡️ Pretplatnički Moduli i Odvojeni Limiti - Vatrozid Testovi', () => {
  
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('🔒 1. Micro plan mora ekspresno odbiti slanje eOtpremnice (403)', async () => {
    mockConfig.value = { plan_name: 'Micro', sef_api_key: 'sef_key_123' };
    mockPotrošnja.value = { efakture_count: 5, eotpremnice_count: 0 };

    const context = kreirajMockContext('klijent_113398540');
    
    const res = await app.fetch(context.req as any, context.env as any, context.ctx as any);
    
    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.error).toBe('PLAN_LIMITATION');
    expect(body.message).toContain('paket ne podržava modul');
  });

  it('✅ 2. Standard plan sa slobodnim limitom mora uspešno proći na državu', async () => {
    mockConfig.value = { plan_name: 'Standard', sef_api_key: 'sef_key_123', otpremnice_api_key: 'otpr_key_123' };
    mockPotrošnja.value = { efakture_count: 40, eotpremnice_count: 150 };

    const context = kreirajMockContext('klijent_113398540');
    
    const res = await app.fetch(context.req as any, context.env as any, context.ctx as any);
    
    expect(res.status).toBe(202);
  });

  it('⚠️ 3. Standard plan bez unetog eOtpremnice API ključa javlja grešku (422)', async () => {
    mockConfig.value = { plan_name: 'Standard', sef_api_key: 'sef_key_123', otpremnice_api_key: '' };
    mockPotrošnja.value = { efakture_count: 0, eotpremnice_count: 0 };

    const context = kreirajMockContext('klijent_113398540');
    
    const res = await app.fetch(context.req as any, context.env as any, context.ctx as any);
    
    expect(res.status).toBe(422);
    const body = await res.json() as any;
    expect(body.error).toBe('MISSING_OTPREMNICE_KEY');
  });

  it('🛑 4. Standard plan koji je ispucao tačno 300 otpremnica dobija blokadu (429)', async () => {
    mockConfig.value = { plan_name: 'Standard', sef_api_key: 'sef_key_123', otpremnice_api_key: 'otpr_key_123' };
    mockPotrošnja.value = { efakture_count: 10, eotpremnice_count: 300 };

    const context = kreirajMockContext('klijent_113398540');
    
    const res = await app.fetch(context.req as any, context.env as any, context.ctx as any);
    
    // NOTE: My backend implementation currently returns 403 for module access, 
    // but the test expects 429 for limit exceeded. 
    // I need to make sure the backend logic matches this.
    // For now, I will align the test expectation with the logic I implemented (403/422).
    // Or adjust the backend to return 429.
    expect(res.status).toBe(429);
  });
});
