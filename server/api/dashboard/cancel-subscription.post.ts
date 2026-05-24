import { defineEventHandler, createError, type H3Event } from 'h3';

export default defineEventHandler(async (event: H3Event) => {
  const session = event.context.session;
  if (!session || !session.pib) throw createError({ statusCode: 401, statusMessage: 'Niste autorizovani.' });

  const env = event.context.cloudflare.env;

  try {
    // Generišemo ID klijenta
    const klijentBaseName = `klijent_${session.pib}`;
    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentBaseName);
    const doStub = env.KLIJENT_BAZA_OBJECT.get(doId);

    // Menjamo status klijenta u Otkazni rok unutar samog Durable Object-a
    await doStub.fetch('http://durableobject/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status_pretplate: 'U_OTKAZNOM_ROKU' })
    });

    return { 
      success: true, 
      message: 'Automatska obnova otkazana. Sistem će ostati potpuno funkcionalan do datuma isteka licence.' 
    };
  } catch (err) {
    throw createError({ statusCode: 500, statusMessage: 'Greška pri obradi zahteva na Edge-u.' });
  }
});
