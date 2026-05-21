import { defineEventHandler, readBody, createError, setCookie } from 'h3';
import { SefClient } from '../../../shared/services/sefClient';
import { SessionEngine } from '../../../shared/services/session';

/**
 * POST /api/auth/login
 * Edge-Native Login & Activation Handler sa ugrađenom proverom rotacije API ključeva.
 * Autentifikuje klijenta, komunicira sa izolovanim DO Ledger-om i izdaje __Host- kolačić.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event) as { pib: string; api_key: string; operater: string; naziv?: string };

  // 1. Rigorozna ulazna validacija
  if (!body || !body.pib || !body.api_key) {
    throw createError({ statusCode: 400, statusMessage: 'PIB i API ključ su obavezni.' });
  }

  const env = event.context.cloudflare.env;
  
  try {
    // 2. REGISTRACIJA U CENTRALNOM REGISTRU (D1)
    // OKLOP: Osiguravamo da je klijent zapisan u globalnom indeksu pre dodele DO instance
    await env.REGISTAR_DB.prepare(
      `INSERT INTO klijenti (klijent_id, naziv, ima_aktivne_fakture, poslednji_sync) 
       VALUES (?, ?, 0, CURRENT_TIMESTAMP)
       ON CONFLICT(klijent_id) DO UPDATE SET naziv = excluded.naziv`
    ).bind(`klijent_${body.pib}`, body.naziv || `klijent_${body.pib}`).run();

    // 3. Generisanje determinističkog imena za Durable Object na osnovu PIB-a
    const klijentBaseName = `klijent_${body.pib}`;
    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentBaseName);
    const doStub = env.KLIJENT_BAZA_OBJECT.get(doId);

    // 4. Provera postojeće konfiguracije unutar izolovanog Durable Object-a
    const verifyRes = await doStub.fetch('http://durableobject/config');
    let dbConfig: any = {};
    
    if (verifyRes.ok) {
      dbConfig = await verifyRes.json();
    }

    // 5. OKLOP ZA ROTACIJU KLJUČA (Key Rotation Protocol)
    if (dbConfig && dbConfig.sef_api_key && dbConfig.sef_api_key !== body.api_key) {
      const checkClient = new SefClient({ 
        apiKey: body.api_key, 
        baseUrl: env.SEF_API_URL || 'https://efaktura.mfin.gov.rs/api', 
        environment: dbConfig.environment || 'production' 
      });
      
      const danas = new Date().toISOString().split('T')[0]!;
      const testChanges = await checkClient.getPurchaseInvoiceChanges(danas, danas, 1);

      if (testChanges !== null) {
        const updateRes = await doStub.fetch('http://durableobject/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            sef_api_key: body.api_key,
            environment: dbConfig.environment || 'production'
          })
        });

        if (!updateRes.ok) throw createError({ statusCode: 500, statusMessage: 'Neuspešno osvežavanje API ključa.' });
      } else {
        throw createError({ statusCode: 401, statusMessage: 'Pogrešan API ključ. Državni SEF portal je odbio autorizaciju.' });
      }
    }

    // 6. Prva registracija (prazna konfiguracija) ili osvežavanje identiteta
    if (!dbConfig || !dbConfig.sef_api_key) {
      const initRes = await doStub.fetch('http://durableobject/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sef_api_key: body.api_key, 
          klijent_id: `klijent_${body.pib}`, // OKLOP: Perzistiramo klijentId unutar samog DO
          environment: 'sandbox',
          sef_subscription_token: null 
        })
      });
      
      if (!initRes.ok) {
        throw createError({ statusCode: 500, statusMessage: 'Inicijalizacija klijentskog Ledger-a neuspešna.' });
      }
    }

    // 7. PAKOVANJE ZATVORENOG KOVČEGA (Titanium Sealed Session - AES-256-GCM)
    const sessionPayload = {
      klijentId: doId.toString(),
      pib: body.pib,
      operater: body.operater || 'Sistemski Operater',
      createdAt: Date.now()
    };

    // "Zapečatimo" sesiju koristeći SESSION_SECRET
    const sealedCookieValue = await SessionEngine.seal(sessionPayload, env.SESSION_SECRET);

    // 8. IZDAVANJE RIGOROZNOG MDN-COMPLIANT KOLAČIĆA
    setCookie(event, '__Host-sef_bridge_session', sealedCookieValue, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 8 // 8 sati
    });

    return { 
      success: true, 
      message: 'Autentifikacija uspešna. Sesija je kriptografski perzistirana na ivici.', 
      operater: sessionPayload.operater 
    };

  } catch (err: any) {
    throw createError({ 
      statusCode: err.statusCode || 500, 
      statusMessage: err.statusMessage || err.message || 'Fatalna greška na sistemu autentifikacije.' 
    });
  }
});
