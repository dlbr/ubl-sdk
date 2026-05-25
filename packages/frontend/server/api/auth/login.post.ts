import { defineEventHandler, readBody, createError, setCookie, type H3Event } from 'h3';
import { SessionEngine } from '@sef/shared/services/session';

/**
 * POST /api/auth/login
 * Nuxt Proxy koji delegira autentifikaciju Backend-u preko Service Binding-a.
 * Zadužen za pakovanje TITANIUM sesije nakon uspešne provere.
 */
export default defineEventHandler(async (event: H3Event) => {
  const body = await readBody(event);
  const env = event.context.cloudflare.env;

  try {
    // 1. Delegiramo autentifikaciju Backend-u
    const backendRes = await env.SEF_API.fetch('https://internal/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!backendRes.ok) {
      const error = await backendRes.json();
      throw createError({ 
        statusCode: backendRes.status, 
        statusMessage: error.error || 'Autentifikacija neuspešna.' 
      });
    }

    const authData = await backendRes.json() as { klijentId: string, pib: string, operater: string };

    // 2. Pakujemo TITANIUM sesiju
    const sessionPayload = {
      klijentId: authData.klijentId,
      pib: authData.pib,
      operater: authData.operater,
      createdAt: Date.now()
    };

    const sealedCookieValue = await SessionEngine.seal(sessionPayload, env.SESSION_SECRET);

    setCookie(event, '__Host-sef_bridge_session', sealedCookieValue, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 8 // 8 sati
    });

    return { 
      success: true, 
      message: 'Autentifikacija uspešna.', 
      operater: sessionPayload.operater 
    };

  } catch (err: any) {
    throw createError({ 
      statusCode: err.statusCode || 500, 
      statusMessage: err.statusMessage || 'Greška na sistemu autentifikacije.' 
    });
  }
});
