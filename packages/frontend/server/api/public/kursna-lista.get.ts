import { defineEventHandler } from 'h3';

/**
 * Proxy ka backend javnoj kursnoj listi.
 * Javna ruta — ne zahteva sesiju.
 */
export default defineEventHandler(async (event) => {
  const env = event.context.cloudflare?.env;

  // Dev fallback: direktno ka backendu
  if (!env?.SEF_API) {
    const res = await fetch('http://localhost:8787/api/public/v1/kursna-lista');
    return res.json();
  }

  const response = await env.SEF_API.fetch('https://internal/api/public/v1/kursna-lista');
  return response.json();
});
