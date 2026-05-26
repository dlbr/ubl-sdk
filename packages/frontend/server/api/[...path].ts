import { defineEventHandler, readRawBody, createError } from 'h3';

/**
 * Catch-all proxy za sve /api/ rute koje nisu eksplicitno
 * definisane u server/api/. Sve ide ka Backend Worker-u via Service Binding.
 * 
 * CONTRACT:
 * - Nuxt server/api/ fajlovi: Nuxt-specifična logika (auth session, D1 direktno)
 * - Sve ostalo: forwarduje ka Backend Worker via SEF_API service binding
 */
export default defineEventHandler(async (event) => {
  const path = event.path;
  const env = event.context.cloudflare?.env;
  const session = event.context.session;

  // Nema backend bindinga — vrati 503 umesto 500
  if (!env?.SEF_API) {
    throw createError({ statusCode: 503, statusMessage: 'Backend Worker binding nije dostupan.' });
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (session?.klijentId) {
    headers['X-Klijent-ID'] = session.klijentId;
    headers['X-Operater'] = session.operater || 'Sistemski Operater';
  }

  const response = await env.SEF_API.fetch(`https://internal${path}`, {
    method: event.method,
    headers,
    body: ['POST', 'PUT', 'PATCH'].includes(event.method)
      ? await readRawBody(event)
      : undefined
  });

  // Propagiraj HTTP status direktno — ne konvertuj u 500
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as any;
    throw createError({
      statusCode: response.status,
      statusMessage: errorData?.error || errorData?.message || response.statusText
    });
  }

  return response.json().catch(() => null);
});
