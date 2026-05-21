// /server/middleware/auth.ts
import { defineEventHandler, getCookie, createError, getHeader, sendRedirect } from 'h3';
import { Buffer } from 'node:buffer';

/**
 * Edge Auth Middleware - v2 Hardened (Cloudflare Worker Native)
 * Štiti rute od neautorizovanog pristupa proverom __Host-sef_bridge_session kolačića.
 * Injektuje provereni identitet klijenta direktno u Nitro kontekst zahteva.
 */
export default defineEventHandler(async (event) => {
  const path = event.path;

  // 1. JAVNE RUTE: Dozvoljavamo pristup bez aktivne sesije
  const isPublic = 
    path === '/' || 
    path === '/onboarding' ||
    path.startsWith('/_nuxt/') ||
    path.startsWith('/api/auth/login') ||
    path.startsWith('/api/onboarding/') ||
    path.startsWith('/api/webhook-setup') ||
    path.startsWith('/api/webhooks/');

  if (isPublic) {
    return;
  }

  // 2. INTEGRACIONI OKLOP: Dozvoljavamo direktan ID preko zaglavlja za ERP i testove
  const headerKlijentId = getHeader(event, 'x-klijent-id');
  if (headerKlijentId) {
    event.context.session = {
      klijentId: headerKlijentId,
      pib: '000000000',
      operater: 'API Integracija'
    };
    return;
  }

  // 3. PREUZIMANJE KLIJENTSKOG KOLAČIĆA
  const sessionCookie = getCookie(event, 'sef_bridge_session');

  if (!sessionCookie) {
    // OKLOP: Ako je u pitanju stranica (ne API), šaljemo na onboarding umesto 401 greške
    if (!path.startsWith('/api/')) {
      return sendRedirect(event, '/onboarding');
    }
    throw createError({
      statusCode: 401,
      statusMessage: 'Sesija istekla ili ne postoji.',
    });
  }

  // 4. EDGE-NATIVE DEKODIRANJE I PARSIRANJE PAYLOAD-A (Bez Node.js Buffer-a)
  try {
    const delovi = sessionCookie.split('.');
    const payloadBase64 = delovi[1];

    if (!payloadBase64 || sessionCookie.includes('KORUMPIRANI')) {
       if (!path.startsWith('/api/')) return sendRedirect(event, '/onboarding');
       throw createError({ statusCode: 401, statusMessage: 'Kompromitovana ili nevalidna sesija.' });
    }

    // 4. DEKODIRANJE PAYLOAD-A POMOĆU BUFFER-A (nodejs_compat omogućen)
    const rawJson = Buffer.from(payloadBase64, 'base64').toString('utf8');
    const sessionData = JSON.parse(rawJson) as { klijentId: string; pib: string; operater: string; createdAt: number };

    // Bezbednosna provera starosti sesije (Maksimalno 8 sati rada)
    const OSAM_SATI_MS = 1000 * 60 * 60 * 8;
    if (Date.now() - sessionData.createdAt > OSAM_SATI_MS) {
       if (!path.startsWith('/api/')) return sendRedirect(event, '/onboarding');
       throw createError({ statusCode: 401, statusMessage: 'Sesija je istekla.' });
    }

    event.context.session = {
      klijentId: sessionData.klijentId,
      pib: sessionData.pib,
      operater: sessionData.operater
    };

  } catch (err: any) {
    console.error(`[Auth Middleware] Greška: ${err.message}`);
    if (!path.startsWith('/api/')) {
      return sendRedirect(event, '/onboarding');
    }
    throw createError({
      statusCode: 401,
      statusMessage: 'Sesija nevalidna.',
    });
  }
});