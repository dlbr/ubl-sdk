import { defineEventHandler, createError, getQuery, setHeader, type H3Event } from 'h3';

export default defineEventHandler(async (event: H3Event) => {
  const session = event.context.session;
  if (!session || !session.klijentId) throw createError({ statusCode: 401, statusMessage: 'Niste autorizovani.' });

  const query = getQuery(event);
  const period = query.period as string || new Date().toISOString().substring(0, 7);

  const env = event.context.cloudflare.env;

  try {
    const backendRes = await env.SEF_API.fetch(`https://internal/api/analytics/pppdv-export?period=${period}`, {
      headers: {
        'X-Klijent-ID': session.klijentId,
        'X-Operater': session.operater
      }
    });

    if (!backendRes.ok) throw createError({ statusCode: backendRes.status, statusMessage: 'Backend greška pri izvozu.' });

    const txt = await backendRes.text();
    
    setHeader(event, 'Content-Type', 'text/plain; charset=utf-8');
    setHeader(event, 'Content-Disposition', `attachment; filename="pppdv_${period}.txt"`);
    
    return txt;

  } catch (err: any) {
    throw createError({ statusCode: 500, statusMessage: err.message });
  }
});
