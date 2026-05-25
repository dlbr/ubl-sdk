import { defineEventHandler, readRawBody } from 'h3';

/**
 * Fallback proxy za sve rute koje nisu eksplicitno definisane u server/api.
 * Omogućava postepenu migraciju i podršku za sve backend rute.
 */
export default defineEventHandler(async (event) => {
  const path = event.path;
  const env = event.context.cloudflare.env;
  const session = event.context.session;

  if (!env.SEF_API) return; // Pustiti Nuxt da baci 404 ako nema bindinga

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (session && session.klijentId) {
    headers['X-Klijent-ID'] = session.klijentId;
    headers['X-Operater'] = session.operater || 'Sistemski Operater';
  }

  try {
    const response = await env.SEF_API.fetch(`https://internal${path}`, {
      method: event.method,
      headers,
      body: ['POST', 'PUT', 'PATCH'].includes(event.method) ? await readRawBody(event) : undefined
    });

    // Ako backend vrati 404, možda Nuxt ima drugu rutu, ali pošto je ovo catch-all u server/api,
    // verovatno želimo da vratimo ono što je backend rekao.
    
    const data = await response.json().catch(() => null);
    return data || response.body;

  } catch (err) {
    // Ako fetch pukne (npr. nema rute na backendu), pustiti Nuxt dalje
    return;
  }
});
