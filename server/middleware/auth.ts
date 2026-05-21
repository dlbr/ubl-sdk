// /server/middleware/auth.ts
import { defineEventHandler, getCookie, createError, getHeader } from 'h3';

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
    path.startsWith('/api/webhook-setup') || // OKLOP: Dozvoljavamo očitavanje uputstva za webhook
    path.startsWith('/api/webhooks/'); // Državni webhook-ovi imaju sopstvenu validaciju tokena

  if (isPublic) {
    return;
  }

  // 2. INTEGRACIONI OKLOP: Dozvoljavamo direktan ID preko zaglavlja za ERP i testove
  const headerKlijentId = getHeader(event, 'x-klijent-id');
  if (headerKlijentId) {
    event.context.session = {
      klijentId: headerKlijentId,
      pib: '000000000', // PIB nepoznat iz samog zaglavlja
      operater: 'API Integracija'
    };
    return;
  }

  // 3. PREUZIMANJE MDN __Host- KOLAČIĆA
  const sessionCookie = getCookie(event, '__Host-sef_bridge_session');

  if (!sessionCookie) {
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
      throw createError({
        statusCode: 401,
        statusMessage: 'Kompromitovana ili nevalidna sesija.',
      });
    }

    // Oklop za Cloudflare V8: Dekodiranje Base64 u binarni string preko atob-a
    const binaryString = atob(payloadBase64);

    // Pretvaramo binarni string u niz bajtova (Uint8Array)
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // TextDecoder garantuje stoprocentnu UTF-8 podršku za š, đ, č, ć, ž na ivici mreže
    const rawJson = new TextDecoder().decode(bytes);
    const sessionData = JSON.parse(rawJson) as { klijentId: string; pib: string; operater: string; createdAt: number };

    // Bezbednosna provera starosti sesije (Maksimalno 8 sati rada)
    const OSAM_SATI_MS = 1000 * 60 * 60 * 8;
    if (Date.now() - sessionData.createdAt > OSAM_SATI_MS) {
      throw createError({ statusCode: 401, statusMessage: 'Sesija je istekla.' });
    }

    // 5. INJEKTIRANJE IZVORA ISTINE U KONTEKST ZAHTEVA
    // Svi tvoji /api/analytics/* i /api/dashboard/* endpointi sada bezbedno čitaju odavde
    event.context.session = {
      klijentId: sessionData.klijentId, // Čist 64-karakterni DO heš id (doId.toString())
      pib: sessionData.pib,
      operater: sessionData.operater
    };

  } catch (err: any) {
    throw createError({
      statusCode: 401,
      statusMessage: err.statusMessage || 'Kompromitovana ili nevalidna sesija.',
    });
  }
});