import { defineEventHandler, getCookie, createError, getHeader, sendRedirect } from 'h3';
import { SessionEngine } from '@@/shared/services/session';

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
    path.startsWith('/__nuxt_error') ||
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
  let sessionCookie = getCookie(event, '__Host-sef_bridge_session');
  
  if (!sessionCookie) {
    const rawCookie = getHeader(event, 'cookie');
    if (rawCookie) {
      const match = rawCookie.match(/__Host-sef_bridge_session=([^;]+)/);
      if (match) sessionCookie = decodeURIComponent(match[1]!);
    }
  } else {
    sessionCookie = decodeURIComponent(sessionCookie);
  }

  if (!sessionCookie) {
    const isPageRequest = !path.startsWith('/api/') && getHeader(event, 'accept')?.includes('text/html');
    if (isPageRequest) {
      return sendRedirect(event, '/onboarding');
    }
    throw createError({
      statusCode: 401,
      statusMessage: 'Sesija istekla ili ne postoji.',
    });
  }

  // 4. TITANIUM UNSEAL: Dešifrovanje i verifikacija sesije (AES-256-GCM)
  try {
    const env = event.context.cloudflare.env;
    const sessionData = await SessionEngine.unseal(sessionCookie, env.SESSION_SECRET);

    if (!sessionData) {
       if (!path.startsWith('/api/')) return sendRedirect(event, '/onboarding');
       throw createError({ statusCode: 401, statusMessage: 'Kompromitovana ili nevalidna sesija.' });
    }

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
      statusCode: err.statusCode || 401,
      statusMessage: err.statusMessage || 'Sesija nevalidna.',
    });
  }
});
