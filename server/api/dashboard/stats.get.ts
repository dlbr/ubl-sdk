import { defineEventHandler, createError } from 'h3';

export default defineEventHandler(async (event) => {
  const session = event.context.session;
  if (!session) throw createError({ statusCode: 401, statusMessage: 'Niste autorizovani.' });

  const env = event.context.cloudflare.env;

  try {
    const klijentBaseName = `klijent_${session.pib}`;
    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentBaseName);
    const doStub = env.KLIJENT_BAZA_OBJECT.get(doId);

    // Vučemo konfiguraciju i trenutno stanje iz SQLite-a klijenta (Edge Logic)
    const res = await doStub.fetch('http://durableobject/stats');
    if (!res.ok) throw createError({ statusCode: 404, statusMessage: 'Metrika nije dostupna.' });
    
    return await res.json();

  } catch (err: any) {
    throw createError({ 
      statusCode: err.statusCode || 500, 
      statusMessage: err.message || 'Greška pri čitanju metrike sa Edge-a.' 
    });
  }
});
