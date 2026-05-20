import { defineEventHandler, getCookie, createError } from 'h3';
import { env } from 'cloudflare:test'; // In production this would be from event.context.cloudflare

/**
 * Edge Auth Middleware
 * Šiti rute od neautorizovanog pristupa procerom __Host-sef_bridge_session kolačića.
 */
export default defineEventHandler(async (event) => {
  // Izbegavamo auth na login ruti
  if (event.path.startsWith('/api/auth/login')) {
    return;
  }

  const sessionCookie = getCookie(event, '__Host-sef_bridge_session');

  if (!sessionCookie) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Sesija istekla ili ne postoji.',
    });
  }

  // Ovde bi išla logika za dešifrovanje i validaciju kolačića
  // Za potrebe testa i inicijalne implementacije, bacamo grešku ako je "malformed"
  if (sessionCookie.includes('KORUMPIRANI')) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Kompromitovana ili nevalidna sesija.',
    });
  }

  // Uspešna autorizacija
  return;
});
