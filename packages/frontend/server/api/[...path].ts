import { defineEventHandler, readRawBody, createError } from 'h3';

/**
 * Catch-all proxy: Nuxt /api/* → Backend Worker via Service Binding.
 * Auth: INTERNAL_API_KEY Bearer token (shared secret).
 */
export default defineEventHandler(async (event) => {
  const path = event.path;
  const env = event.context.cloudflare?.env;
  const session = event.context.session;

  if (!env?.SEF_API) {
    throw createError({ statusCode: 503, statusMessage: 'Backend Worker binding nije dostupan.' });
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${env.INTERNAL_API_KEY ?? ''}`,
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

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as any;
    throw createError({
      statusCode: response.status,
      statusMessage: (errorData as any)?.error || (errorData as any)?.message || response.statusText
    });
  }

  return response.json().catch(() => null);
});
