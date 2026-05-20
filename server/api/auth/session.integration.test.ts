import { describe, it, expect } from 'vitest';
import { createEvent, eventHandler, setCookie, getHeader } from 'h3'; 
import authMiddleware from '../../middleware/auth';
import loginHandler from './login.post';
import logoutHandler from './logout.post';

// Verno preslikano okruženje Cloudflare mreže za testiranje
const mockEnv = {
  KLIJENT_BAZA_OBJECT: {
    idFromName: (id: string) => ({ toString: () => `mock_do_hex_id_for_${id}` }),
    get: () => ({
      fetch: async (url: string, options?: any) => {
        if (url.endsWith('/config')) {
          // Ako je u pitanju POST (inicijalizacija), vraćamo uspeh
          if (options?.method === 'POST') return { ok: true };
          // Za GET vraćamo postojeći ključ
          return {
            ok: true,
            json: async () => ({ sef_api_key: 'sk_live_blindirani_kljuc_2026' })
          };
        }
        return { ok: false };
      }
    })
  }
};

describe('Edge Session Management - Integracioni Testovi', () => {
  const SESSION_SECRET = 'ZAKUCANI_SECRET_ZA_PRODUKCIJU_MIN_32_CHAR';
  process.env.SESSION_SECRET = SESSION_SECRET;

  it('Scenario 1: Uspešan login mora izvršiti registraciju i generisati __Host- kolačić', async () => {
    // Konstruišemo realan H3 event omotač
    const req = { method: 'POST', url: '/api/auth/login', headers: { 'content-type': 'application/json' } } as any;
    const headers = new Headers();
    const res = {
      getHeader: (n: string) => headers.get(n) || '',
      setHeader: (n: string, v: string) => { headers.set(n, v); }
    } as any;
    
    const event = createEvent(req, res);
    event.context.cloudflare = { env: mockEnv };

    // Injektujemo body tako da ga h3 `readBody` uspešno presretne
    event.context.__body = {
      pib: '100000010',
      api_key: 'sk_live_blindirani_kljuc_2026',
      operater: 'Knjigovođa Nikola'
    };
    Object.defineProperty(event.node.req, 'body', { value: event.context.__body });

    // POKRETANJE IZVRŠENJA: Pozivamo stvarni login handler
    const odgovor = await loginHandler(event);
    
    expect(odgovor.success).toBe(true);
    expect(odgovor.operater).toBe('Knjigovođa Nikola');

    // VERIFIKACIJA OKLOPA: Da li je postavljen ispravan __Host- kolačić?
    const setCookieHeader = headers.get('set-cookie');
    expect(setCookieHeader).toBeDefined();
    expect(setCookieHeader).toContain('__Host-sef_bridge_session=');
    expect(setCookieHeader).toContain('HttpOnly');
    expect(setCookieHeader).toContain('Secure');
    expect(setCookieHeader).toContain('SameSite=Strict');
  });

  it('Scenario 2: Auth middleware mora blokirati zahteve bez prisutnog kolačića', async () => {
    const req = { method: 'GET', url: '/api/analytics/pppdv-summary?period=2026-05', headers: {} } as any;
    const res = { getHeader: () => '', setHeader: () => {} } as any;
    const event = createEvent(req, res);
    event.context.cloudflare = { env: mockEnv };

    // Middleware mora da baci 401 izuzetak
    await expect(authMiddleware(event)).rejects.toThrowError(/Sesija istekla ili ne postoji/);
  });

  it('Scenario 3: Auth middleware mora detektovati i odbiti hakovan/korigovan kolačić', async () => {
    const malformedCookieValue = 'mockIv.KORUMPIRANI_BASE64_STRING_KOJI_NE_MOZE_DA_SE_DESIFRUJE';
    
    // H3 interno čita kolačiće iz 'cookie' zaglavlja sa malim slovima
    const req = { 
      method: 'GET', 
      url: '/api/analytics/pppdv-summary?period=2026-05', 
      headers: { 'cookie': `__Host-sef_bridge_session=${malformedCookieValue}` } 
    } as any;
    
    const res = { getHeader: () => '', setHeader: () => {} } as any;
    const event = createEvent(req, res);
    event.context.cloudflare = { env: mockEnv };

    await expect(authMiddleware(event)).rejects.toThrowError(/Kompromitovana ili nevalidna sesija/);
  });

  it('Scenario 4: Uspešan logout mora izbrisati kolačić i zabraniti keširanje stanja', async () => {
    const req = { method: 'POST', url: '/api/auth/logout', headers: {} } as any;
    const headers = new Headers();
    const res = {
      getHeader: (n: string) => headers.get(n) || '',
      setHeader: (n: string, v: string) => { headers.set(n, v); }
    } as any;

    const event = createEvent(req, res);
    event.context.cloudflare = { env: mockEnv };

    const odgovor = await logoutHandler(event);
    expect(odgovor.success).toBe(true);

    // Provera uništenja kolačića (Max-Age=0)
    const setCookieHeader = headers.get('set-cookie');
    expect(setCookieHeader).toContain('Max-Age=0');

    // Provera Cache-Control oklopa protiv back-button prevare
    const cacheControlHeader = headers.get('cache-control');
    expect(cacheControlHeader).toContain('no-store, must-revalidate');
  });
});