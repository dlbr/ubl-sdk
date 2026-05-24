import { defineEventHandler, readBody, createError, type H3Event } from 'h3';

export default defineEventHandler(async (event: H3Event) => {
  // Provera administratorskog Bearer ključa (Sistemska bezbednost)
  const authHeader = event.node.req.headers['authorization'];
  const env = event.context.cloudflare.env;
  if (!authHeader || authHeader !== `Bearer ${env.ADMIN_API_KEY}`) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized admin access.' });
  }

  const body = await readBody(event) as { pib: string; paket_id: string; limit_faktura_godisnje: string };
  if (!body.pib) throw createError({ statusCode: 400, statusMessage: 'PIB je obavezan.' });

  try {
    const klijentBaseName = `klijent_${body.pib}`;
    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentBaseName);
    const doStub = env.KLIJENT_BAZA_OBJECT.get(doId);

    // Proračun novog vremenskog okvira (Sledećih 365 dana)
    const danasnjiDatum = new Date().toISOString().split('T')[0]!;
    const godinaDanaUnapredMs = Date.now() + (365 * 24 * 60 * 60 * 1000);

    // Čišćenje starih notifikacionih zastavica i postavljanje novog datuma isteka
    await doStub.fetch('http://durableobject/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status_pretplate: 'AKTIVAN',
        plan: body.paket_id || 'Plus',
        billing_period: 'annual',
        limit_faktura_godisnje: body.limit_faktura_godisnje || '6000',
        licenca_od_datuma: danasnjiDatum,
        licenca_istice_timestamp: String(godinaDanaUnapredMs),
        avans_za_obnovu_poslat: 0
      })
    });

    // Budimo Durable Object alarm koji je bio ugašen usled blokade
    await doStub.fetch('http://durableobject/sync-sef', { method: 'POST' });

    return { success: true, message: `Uspešno proknjižena godišnja obnova za PIB ${body.pib}.` };
  } catch (err) {
    throw createError({ statusCode: 500, statusMessage: 'Krah pri upisu u DO Ledger.' });
  }
});
