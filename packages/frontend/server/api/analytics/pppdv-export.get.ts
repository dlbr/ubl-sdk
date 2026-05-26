import { defineEventHandler, createError, getQuery, setHeader } from 'h3';

export default defineEventHandler(async (event) => {
  const env = event.context.cloudflare?.env;
  const session = event.context.session;
  if (!session?.klijentId) throw createError({ statusCode: 401 });

  const { period = new Date().toISOString().substring(0, 7) } = getQuery(event) as { period?: string };

  // TXT fajl — ostaje fetch jer RPC ne podržava streaming binarnih odgovora
  const res = await env.SEF_API.fetch(
    `https://internal/api/analytics/pppdv-export?period=${period}&klijentId=${session.klijentId}`,
    { headers: { 'Authorization': `Bearer ${env.INTERNAL_API_KEY ?? ''}`, 'X-Klijent-ID': session.klijentId } }
  );

  if (!res.ok) throw createError({ statusCode: res.status, statusMessage: 'Greška pri izvozu.' });

  const txt = await res.text();
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8');
  setHeader(event, 'Content-Disposition', `attachment; filename="pppdv_${period}.txt"`);
  return txt;
});
