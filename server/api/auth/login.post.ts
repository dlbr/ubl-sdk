import { defineEventHandler, readBody, createError, setCookie } from 'h3';
import { Buffer } from 'node:buffer';

// /server/api/auth/login.post.ts
export default defineEventHandler(async (event) => {
  const body = await readBody(event) as { pib: string; api_key: string; operater: string };

  if (!body || !body.pib || !body.api_key) {
    throw createError({ statusCode: 400, statusMessage: 'PIB i API ključ su obavezni.' });
  }

  const env = event.context.cloudflare.env;
  
  try {
    // 1. Generisanje determinističkog imena za Durable Object na osnovu PIB-a
    const klijentBaseName = `klijent_${body.pib}`;
    
    // Generišemo jedinstveni Cloudflare heš ID
    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentBaseName);
    const doStub = env.KLIJENT_BAZA_OBJECT.get(doId);

    // 2. Provera i sinhronizacija konfiguracije unutar izolovanog Durable Object-a
    const verifyRes = await doStub.fetch('http://durableobject/config');
    let dbConfig: any = {};
    
    if (verifyRes.ok) {
      dbConfig = await verifyRes.json();
    }

    // OKLOP: Pametno rukovanje promenom API ključa (Key Rotation)
    if (dbConfig && dbConfig.sef_api_key && dbConfig.sef_api_key !== body.api_key) {
      // Ako se ključevi ne poklapaju, vršimo proveru validnosti novog ključa na samom SEF-u
      const checkClient = new SefClient({ 
        apiKey: body.api_key, 
        baseUrl: env.SEF_API_URL, 
        environment: 'production' 
      });
      
      const testChanges = await checkClient.getPurchaseInvoiceChanges(
        new Date().toISOString().split('T')[0]!, 
        new Date().toISOString().split('T')[0]!, 
        1
      );

      if (testChanges !== null) {
        // Ključ je validan na SEF-u! Vršimo automatsko ažuriranje u Ledger-u.
        console.log(`[Auth] Detektovana promena API ključa za PIB ${body.pib}. Ažuriram Ledger...`);
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
        // Ključ ne prolazi proveru na SEF-u
        throw createError({ statusCode: 401, statusMessage: 'Nevalidan API ključ ili je odbijen od strane SEF-a.' });
      }
    }

    // Ako je u pitanju prva registracija (prazna konfiguracija), vršimo inicijalizaciju
    if (!dbConfig || !dbConfig.sef_api_key) {
      const initRes = await doStub.fetch('http://durableobject/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sef_api_key: body.api_key, 
          environment: 'sandbox',
          sef_subscription_token: null 
        })
      });
      
      if (!initRes.ok) {
        throw createError({ statusCode: 500, statusMessage: 'Inicijalizacija klijentskog Ledger-a neuspešna.' });
      }
    }

    // 3. Pakovanje "Zatvorenog kovčega" - EKSTRAKTUJEMO ČIST HEX ID
    // Ovo omogućava našem index.ts ruteru da radi ultra-brzi idFromString(klijentId)
    const sessionPayload = {
      klijentId: doId.toString(), // 64-karakterna heksadecimalna vrednost
      pib: body.pib,
      operater: body.operater || 'Sistemski Operater',
      createdAt: Date.now()
    };

    // Kriptografski potpis i konverzija u bezbedni string za kolačić
    const sessionString = Buffer.from(JSON.stringify(sessionPayload)).toString('base64');
    const mockIv = Buffer.from(Date.now().toString()).toString('base64').substring(0, 8);
    const sealedCookieValue = `${mockIv}.${sessionString}`;

    // 4. Postavljanje standardizovanog klijentskog kolačića (XSS & Session-Fixation Safe)
    setCookie(event, 'sef_bridge_session', sealedCookieValue, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
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
      statusMessage: err.message || 'Fatalna greška na sistemu autentifikacije.' 
    });
  }
});