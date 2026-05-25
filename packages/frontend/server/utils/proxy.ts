import { H3Event, createError } from 'h3';

/**
 * Proxy zahtev ka Backend Worker-u preko Service Binding-a.
 */
export async function proxyToBackend(event: H3Event, path: string, options: any = {}) {
  const env = event.context.cloudflare.env;
  const session = event.context.session;

  if (!env.SEF_API) {
    throw createError({ statusCode: 500, statusMessage: 'Backend binding (SEF_API) nije konfigurisan.' });
  }

  const headers = {
    ...options.headers,
    'Content-Type': 'application/json'
  };

  // Injektujemo identitet iz sesije ako postoji
  if (session && session.klijentId) {
    headers['X-Klijent-ID'] = session.klijentId;
    headers['X-Operater'] = session.operater || 'Sistemski Operater';
  }

  try {
    const url = `https://internal${path}`;
    const response = await env.SEF_API.fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw createError({
        statusCode: response.status,
        statusMessage: errorData.error || errorData.message || 'Greška na backend servisu.'
      });
    }

    return await response.json();
  } catch (err: any) {
    if (err.statusCode) throw err;
    throw createError({
      statusCode: 500,
      statusMessage: `Neuspešna komunikacija sa backendom: ${err.message}`
    });
  }
}
