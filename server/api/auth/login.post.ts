import { defineEventHandler, readBody, createError, setCookie } from 'h3';
import { SefClient } from '../../../shared/services/sefClient';
import { SessionEngine } from '../../../shared/services/session';
import { AuthEngine } from '../../../shared/services/auth';

/**
 * POST /api/auth/login
 * Edge-Native Login & Activation Handler sa ugrađenom proverom rotacije API ključeva.
 * Podržava i klasičan login (lozinka) i aktivaciju/oporavak (SEF API ključ).
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event) as { pib: string; api_key?: string; password?: string; operater: string; naziv?: string };

  if (!body || !body.pib) {
    throw createError({ statusCode: 400, statusMessage: 'PIB je obavezan.' });
  }

  const env = event.context.cloudflare.env;
  
  try {
    const klijentBaseName = `klijent_${body.pib}`;
    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentBaseName);
    const doStub = env.KLIJENT_BAZA_OBJECT.get(doId);

    // 1. Provera postojeće konfiguracije
    const verifyRes = await doStub.fetch('http://durableobject/config');
    let dbConfig: any = null;
    if (verifyRes.ok) dbConfig = await verifyRes.json();

    let passwordHashToStore: string | null = null;
    
    // SCENARIO A: Aktivacija ili Oporavak (Korisnik poslao SEF API ključ)
    if (body.api_key) {
      console.log(`[Auth Edge] Pokrećem verifikaciju SEF ključa za PIB ${body.pib}...`);
      
      const checkClient = new SefClient({ 
        apiKey: body.api_key, 
        baseUrl: env.SEF_API_URL || 'https://efaktura.mfin.gov.rs/api', 
        environment: dbConfig?.environment || 'production' 
      });
      
      const danas = new Date().toISOString().split('T')[0]!;
      const testChanges = await checkClient.getPurchaseInvoiceChanges(danas, danas, 1);

      if (testChanges === null) {
        throw createError({ statusCode: 401, statusMessage: 'Nevalidan SEF API ključ. Provera na državnom portalu nije uspela.' });
      }

      // Ako je uz ključ poslata i nova lozinka, hesiramo je
      if (body.password) {
        passwordHashToStore = await AuthEngine.hashPassword(body.password);
      }

      // Ažuriramo D1 registar za svaki slučaj
      await env.REGISTAR_DB.prepare(
        `INSERT INTO klijenti (klijent_id, naziv, ima_aktivne_fakture, poslednji_sync) 
         VALUES (?, ?, 0, CURRENT_TIMESTAMP)
         ON CONFLICT(klijent_id) DO UPDATE SET naziv = excluded.naziv`
      ).bind(`klijent_${body.pib}`, body.naziv || `klijent_${body.pib}`).run();

      // Ažuriramo DO Ledger
      const updateRes = await doStub.fetch('http://durableobject/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sef_api_key: body.api_key,
          klijent_id: `klijent_${body.pib}`,
          password_hash: passwordHashToStore || dbConfig?.password_hash,
          environment: dbConfig?.environment || 'sandbox'
        })
      });

      if (!updateRes.ok) throw createError({ statusCode: 500, statusMessage: 'Greška pri perzistenciji konfiguracije.' });

    } else if (body.password) {
      // SCENARIO B: Standardni Login (Korisnik poslao lozinku)
      if (!dbConfig || !dbConfig.sef_api_key) {
        throw createError({ statusCode: 404, statusMessage: 'Firma nije aktivirana. Koristite SEF API ključ za prvi ulazak.' });
      }

      const loginCheckRes = await doStub.fetch('http://durableobject/api/internal/verify-password', {
        method: 'POST',
        body: JSON.stringify({ password: body.password })
      });

      if (!loginCheckRes.ok) {
        throw createError({ statusCode: 401, statusMessage: 'Pogrešna lozinka ili PIB.' });
      }
    } else {
      throw createError({ statusCode: 400, statusMessage: 'Morate uneti lozinku ili SEF API ključ.' });
    }

    // 2. PAKOVANJE TITANIUM SESIJE
    const sessionPayload = {
      klijentId: doId.toString(),
      pib: body.pib,
      operater: body.operater || 'Sistemski Operater',
      createdAt: Date.now()
    };

    const sealedCookieValue = await SessionEngine.seal(sessionPayload, env.SESSION_SECRET);

    setCookie(event, '__Host-sef_bridge_session', sealedCookieValue, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 8 // 8 sati
    });

    return { 
      success: true, 
      message: 'Autentifikacija uspešna.', 
      operater: sessionPayload.operater 
    };

  } catch (err: any) {
    throw createError({ 
      statusCode: err.statusCode || 500, 
      statusMessage: err.message || 'Greška na sistemu autentifikacije.' 
    });
  }
});
