import { defineEventHandler, readBody, createError, setCookie, type H3Event } from 'h3';
import { SefClient } from '../../../shared/services/sefClient';
import { SessionEngine } from '../../../shared/services/session';
import { AuthEngine } from '../../../shared/services/auth';

/**
 * POST /api/auth/login
 * Edge-Native Login & Activation Handler sa ugrađenom proverom rotacije API ključeva.
 * Podržava i klasičan login (lozinka) i aktivaciju/oporavak (SEF API ključ).
 */
export default defineEventHandler(async (event: H3Event) => {
  const body = await readBody(event) as { 
    pib: string; 
    api_key?: string; 
    password?: string; 
    operater: string; 
    naziv?: string;
    plan?: string;
    billing_period?: string;
  };

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
      
      const danas = new Date().toISOString().split('T')[0]!;
      let verifiedEnv: 'production' | 'sandbox' | null = null;

      // OKLOP: Automatska detekcija okruženja (Prvo probamo produkciju, pa sandbox)
      const tryEnvs: Array<'production' | 'sandbox'> = ['production', 'sandbox'];
      
      for (const envType of tryEnvs) {
        // OKLOP: Striktno koristimo env varijablu bez fallback-a
        const baseUrl = env.SEF_API_URL;

        const checkClient = new SefClient({ 
          apiKey: body.api_key, 
          baseUrl, 
          environment: envType
        });

        try {
          // OKLOP: getUnitMeasures je najpouzdaniji način za provere konekcije i ključa
          const testMeasures = await checkClient.getUnitMeasures();
          if (testMeasures !== null) {
            verifiedEnv = envType;
            console.log(`[Auth Edge] Ključ uspešno verifikovan na: ${envType}`);
            break;
          }
        } catch (e: any) {
          console.warn(`[Auth Edge] Verifikacija neuspešna na ${envType}: ${e.message}`);
          if (e.message.includes('Circuit Breaker') || e.message.includes('Timeout') || e.message.includes('offline')) {
            throw createError({ 
              statusCode: 503, 
              statusMessage: 'Državni SEF portal je trenutno nedostupan ili u prekidu. Molimo pokušajte kasnije.' 
            });
          }
        }
      }

      if (!verifiedEnv) {
        throw createError({ 
          statusCode: 401, 
          statusMessage: 'Nevalidan SEF API ključ ili pogrešan PIB. Provera na državnom portalu nije uspela.' 
        });
      }

      // Ako je uz ključ poslata i nova lozinka, hesiramo je
      if (body.password) {
        passwordHashToStore = await AuthEngine.hashPassword(body.password);
      }

      // OKLOP: Finansijska inicijalizacija (ako klijent nije već bio podešen)
      const selectedPlan = body.plan || dbConfig?.plan_name || 'Micro';
      const selectedPeriod = body.billing_period || dbConfig?.billing_period || 'monthly';
      const licencaOd = dbConfig?.licenca_od_datuma || danas;
      
      // Mapiranje limita na osnovu plana
      const planLimits: Record<string, number> = {
        'Micro': 50,
        'Plus': 500,
        'Agency': 5000,
        'Enterprise': 999999
      };
      const selectedLimit = planLimits[selectedPlan] || 50;

      // Ako je godišnji model, postavljamo rok na 365 dana
      let licencaIstice = dbConfig?.licenca_istice_timestamp || null;
      if (!licencaIstice && selectedPeriod === 'annual') {
        licencaIstice = String(Date.now() + (365 * 24 * 60 * 60 * 1000));
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
          environment: verifiedEnv, // Čuvamo detektovano okruženje
          plan: selectedPlan,
          limit: selectedLimit,
          billing_period: selectedPeriod,
          licenca_od_datuma: licencaOd,
          licenca_istice_timestamp: licencaIstice
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
      klijentId: klijentBaseName, // OKLOP: Čuvamo čitljivo ime, ne hex ID
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
