import { defineEventHandler, createError, getQuery } from 'h3';

export default defineEventHandler(async (event) => {
  const session = event.context.session;
  if (!session) throw createError({ statusCode: 401, statusMessage: 'Niste autorizovani.' });

  const query = getQuery(event);
  const period = query.period as string || new Date().toISOString().substring(0, 7);

  const env = event.context.cloudflare.env;

  try {
    const klijentBaseName = `klijent_${session.pib}`;
    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentBaseName);
    const doStub = env.KLIJENT_BAZA_OBJECT.get(doId);

    // Pozivamo DO za generisanje TXT fajla
    const res = await doStub.fetch(`http://durableobject/api/analytics/pppdv-export?period=${period}`);
    
    if (!res.ok) throw createError({ statusCode: 500, statusMessage: 'Greška pri generisanju izvoza.' });

    const txt = await res.text();

    // Postavljamo zaglavlja za preuzimanje fajla
    event.node.res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    event.node.res.setHeader('Content-Disposition', `attachment; filename="pppdv_${period}.txt"`);
    
    return txt;

  } catch (err: any) {
    throw createError({ 
      statusCode: err.statusCode || 500, 
      statusMessage: err.message || 'Greška na Edge-u.' 
    });
  }
});
