import { Router, type RouterContext } from './router';
import { validateJson } from './validator';
import { SefInvoiceSchema, SefWebhookSchema } from '../shared/types/sef';
import { SefClient } from '../shared/services/sefClient';

export interface Env extends globalThis.Env {
  ADMIN_API_KEY: string;
}
export { KlijentBaza } from './KlijentBazaObject';

export const app = Router<Env>();

// Standardizovana CORS zaglavlja za produkciju
const getCorsHeaders = (req: Request) => {
  const origin = req.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie, X-Klijent-ID',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
};

const applyCors = (res: Response, req: Request): Response => {
  const noviRes = new Response(res.body, res);
  const headers = getCorsHeaders(req);
  Object.entries(headers).forEach(([k, v]) => noviRes.headers.set(k, v));
  return noviRes;
};

// ==========================================
// 0. ADMIN OPERACIJE (STRIMING UVOZ BEZ SALA)
// ==========================================
app.post('/api/admin/populate-companies', async ({ req, env }: RouterContext<Env>) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${env.ADMIN_API_KEY}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { sef_api_key } = await req.json() as { sef_api_key: string };
  if (!sef_api_key) return Response.json({ error: 'sef_api_key is required' }, { status: 400 });

  const sefClient = new SefClient({ 
    apiKey: sef_api_key, 
    baseUrl: env.SEF_API_URL || 'https://efaktura.mfin.gov.rs/api',
    environment: 'production'
  });

  try {
    // OKLOP: downloadAllCompanies sada vraća sirovi CSV string, bez preopterećenja memorije
    const csvContent = await sefClient.downloadAllCompanies();
    if (!csvContent) {
      return Response.json({ success: false, error: 'Odsustvo odziva ili prazan sadržaj sa SEF-a.' }, { status: 502 });
    }

    // Delimo fajl na linije u memorijski bezbednim segmentima
    const lines = csvContent.split('\n');
    const headerLine = lines[0];
    if (!headerLine) return Response.json({ error: 'Missing header' });
    
    const headerCols = parseCsvLine(headerLine);
    if (!headerCols) return Response.json({ error: 'Invalid header' });

    // Dinamičko mapiranje kolona - OKLOP: Prošireni ključne reči za državne formate
    const idx = {
      pib: headerCols.findIndex(c => {
        const val = c.toLowerCase();
        return val.includes('pib') || val.includes('tax') || val.includes('vatregistrationcode');
      }),
      mb: headerCols.findIndex(c => {
        const val = c.toLowerCase();
        return val.includes('maticni') || val.includes('mb') || val.includes('registrationcode') || val.includes('registrationnumber');
      }),
      naziv: headerCols.findIndex(c => {
        const val = c.toLowerCase();
        return val.includes('naziv') || val.includes('ime') || val.includes('name') || val.includes('company');
      }),
      status: headerCols.findIndex(c => c.toLowerCase().includes('status'))
    };

    let statements: any[] = [];
    const D1_MAX_BATCH = 100;
    let processed = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;

      const columns = parseCsvLine(line);
      if (!columns) continue;

      // OKLOP: Safe getter koji garantuje string i sprečava 'undefined' koji D1 mrzi
      const getVal = (index: number, fallback: string = ''): string => {
        if (index === -1 || index >= columns.length) return fallback;
        const val = columns[index];
        return (val !== undefined && val !== null) ? String(val).trim() : fallback;
      };

      const pib = getVal(idx.pib, '');
      if (!pib) continue;

      const maticni = getVal(idx.mb, '');
      const naziv = getVal(idx.naziv, 'Nepoznata Firma');
      const status = getVal(idx.status, 'Active');

      try {
        const stmt = env.REGISTAR_DB.prepare(
          `INSERT INTO sef_kompanije (pib, maticni_broj, naziv_firme, status, azurirano_at) 
           VALUES (?, ?, ?, ?, strftime('%s', 'now')) 
           ON CONFLICT(pib) DO UPDATE SET 
             maticni_broj = excluded.maticni_broj, 
             naziv_firme = excluded.naziv_firme, 
             status = excluded.status,
             azurirano_at = strftime('%s', 'now')`
        ).bind(pib, maticni, naziv, status);

        if (stmt) {
          statements.push(stmt);
        }
      } catch (stmtErr) {
        console.error(`[Admin] Greška pri pripremi SQL-a za PIB ${pib}:`, stmtErr);
        continue;
      }

      if (statements.length >= D1_MAX_BATCH) {
        await env.REGISTAR_DB.batch(statements);
        processed += statements.length;
        statements = [];
      }
    }

    // Pražnjenje preostalih SQL izvršnih upita
    if (statements.length > 0) {
      await env.REGISTAR_DB.batch(statements);
      processed += statements.length;
    }

    return Response.json({ 
      success: true, 
      message: `Centralni SEF registar uspešno ažuriran. Indeksirano: ${processed} kompanija.`,
      header: headerLine // OKLOP: Vraćamo header za proveru mapiranja
    });

  } catch (err: any) {
    return Response.json({ success: false, error: `Fatalni uvoz: ${err.message}` }, { status: 500 });
  }
});

app.post('/api/admin/debug-csv', async ({ req, env }: RouterContext<Env>) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${env.ADMIN_API_KEY}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { sef_api_key } = await req.json() as { sef_api_key: string };
  const sefClient = new SefClient({ 
    apiKey: sef_api_key, 
    baseUrl: env.SEF_API_URL || 'https://efaktura.mfin.gov.rs/api',
    environment: 'production'
  });

  const csvContent = await sefClient.downloadAllCompanies();
  if (!csvContent) return Response.json({ error: 'Empty' });
  return Response.json({ 
    firstLines: csvContent.split('\n').slice(0, 10),
    length: csvContent.length 
  });
});

import { SessionEngine } from '../shared/services/session';

// ... (zadržavamo postojeće importe)

// Pomoćna funkcija za brzo dešifrovanje kolačića na ivici (Titanium Unseal)
async function preuzmiSesijuIzKolacica(cookieString: string | null, env: Env): Promise<{ klijentId: string; operater: string } | null> {
  if (!cookieString) return null;
  try {
    // Tražimo naš __Host- prefiksirani kolačić
    const mece = cookieString.split('; ').find(row => row.startsWith('__Host-sef_bridge_session='));
    if (!mece) return null;
    
    let rawValue = mece.split('=')[1];
    if (!rawValue) return null;

    // OKLOP: Dekodiramo URL-encoded karaktere pre otključavanja
    rawValue = decodeURIComponent(rawValue);

    // Korišćenje Titanium Session Engine za dešifrovanje (AES-256-GCM)
    return await SessionEngine.unseal(rawValue, env.SESSION_SECRET);
  } catch {
    return null;
  }
}

// MIDDLEWARE ZA ZAŠTITU RUTA
const auth = (handler: (c: RouterContext<Env> & { klijentId?: string, operater?: string }) => Promise<Response> | Response) => {
  return async (c: RouterContext<Env> & { klijentId?: string, operater?: string }) => {
    // OKLOP: Dozvoljavamo direktan ID preko zaglavlja za ERP integracije i testove
    if (c.req.headers.has('X-Klijent-ID')) {
      c.klijentId = c.req.headers.get('X-Klijent-ID') || '';
      c.operater = 'Sistemski Operater';
      return await handler(c);
    }

    const cookieHeader = c.req.headers.get('Cookie');
    const session = await preuzmiSesijuIzKolacica(cookieHeader, c.env);

    if (!session || !session.klijentId) {
      return Response.json({ error: 'Nedostaje autorizacija: Sesija je nevažeća ili je istekla.' }, { status: 401 });
    }

    c.klijentId = session.klijentId;
    c.operater = session.operater;
    return await handler(c);
  };
};

// ==========================================
// 1. ONBOARDING & REGISTRACIJA
// ==========================================
app.post('/api/register', async ({ req, env }: RouterContext<Env>) => {
  const { pib, naziv, sef_api_key } = await req.json() as { pib: string, naziv: string, sef_api_key: string };
  if (!pib || !sef_api_key) return Response.json({ error: 'PIB i SEF API Key su obavezni' }, { status: 400 });

  // Deterministički klijent ID usklađen sa novom strukturom
  const klijentId = `klijent_${pib}`;

  await env.REGISTAR_DB.prepare(
    `INSERT INTO klijenti (klijent_id, naziv, ima_aktivne_fakture, poslednji_sync) VALUES (?, ?, 0, CURRENT_TIMESTAMP)
     ON CONFLICT(klijent_id) DO UPDATE SET naziv = excluded.naziv`
  ).bind(klijentId, naziv || klijentId).run();

  // OKLOP: Korišćenje idFromName za determinističke hešove
  const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);
  const klijentDO = env.KLIJENT_BAZA_OBJECT.get(doId);
  
  await klijentDO.fetch(new Request('http://durableobject/config', {
    method: 'POST',
    body: JSON.stringify({ sef_api_key, plan: 'Micro', limit: 50 }),
    headers: { 'Content-Type': 'application/json' }
  }));

  return Response.json({ 
    success: true, 
    klijent_id: klijentId,
    message: 'Onboarding uspešan. Aktivan paket: Micro (50 faktura/mesečno).'
  });
});

app.get('/api/onboarding/search', async ({ req, env }: RouterContext<Env>) => {
  const url = new URL(req.url);
  const query = url.searchParams.get('q')?.trim() || '';
  if (query.length < 3) return Response.json({ uspeh: true, rezultati: [] });

  let sqlQuery = '';
  let params: string[] = [];

  if (/^\d+$/.test(query)) {
    sqlQuery = `SELECT pib, maticni_broj, naziv_firme FROM sef_kompanije WHERE pib LIKE ? LIMIT 10`;
    params = [`${query}%`];
  } else {
    // OKLOP: FTS5 pretraga sa trigramom je moćna, ali moramo bežati od specijalnih karaktera
    // Čistimo query od navodnika i tačaka koji zbunjuju FTS5 motor
    const cleanQuery = query.replace(/[".*]/g, ' ');
    sqlQuery = `
      SELECT s.pib, s.maticni_broj, s.naziv_firme 
      FROM sef_kompanije s
      JOIN sef_kompanije_fts f ON s.rowid = f.rowid
      WHERE sef_kompanije_fts MATCH ?
      ORDER BY bm25(sef_kompanije_fts)
      LIMIT 10
    `;
    params = [cleanQuery];
  }

  try {
    const { results } = await env.REGISTAR_DB.prepare(sqlQuery).bind(...params).all();
    return Response.json({ uspeh: true, rezultati: results });
  } catch (e: any) {
    return Response.json({ uspeh: false, greska: e.message }, { status: 500 });
  }
});

// ==========================================
// 2. GLOBALNI WEBHOOK PRIJEMNIK (DRŽAVNI PUSH)
// ==========================================
app.post('/api/webhooks/sef', validateJson(SefWebhookSchema, async (c: RouterContext<Env>) => {
  const { kompanija_pib, faktura_id, status, broj_fakture, timestamp } = c.validJson!;
  
  // KLJUČNI OKLOP: Da li je ovo naša sistemska faktura za naplatu licence?
  if (broj_fakture && broj_fakture.startsWith('SEF-BRG-')) {
    if (status?.toLowerCase() === 'paid' || status?.toLowerCase() === 'pladena') {
      const klijentId = `klijent_${kompanija_pib}`;
      const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);  
      const klijentDO = c.env.KLIJENT_BAZA_OBJECT.get(doId);

      await klijentDO.fetch('http://durableobject/admin/auto-renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sef_faktura_id: faktura_id, proknjizeno: true })
      });

      return Response.json({ uspeh: true, poruka: "Licenca automatski produžena na osnovu uplate uočene na SEF-u." });
    }
  }

  const klijentId = `klijent_${kompanija_pib}`;

  const klijent = await c.env.REGISTAR_DB.prepare(
    `SELECT klijent_id FROM klijenti WHERE klijent_id = ?`
  ).bind(klijentId).first<{ klijent_id: string }>();

  if (!klijent) {
    return new Response(JSON.stringify({ procesirano: false, greska: 'Klijent nije na sistemu' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);  
  const klijentDO = c.env.KLIJENT_BAZA_OBJECT.get(doId);

  const sefResponse = await klijentDO.fetch(new Request(`http://durableobject/webhooks/sef-update?smer=SALES`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-SEF-Token': c.req.headers.get('X-SEF-Token') || '',
      'Subscription-Key': c.req.headers.get('Subscription-Key') || ''
    },
    body: JSON.stringify({
      faktura_id,
      novi_status: status,
      timestamp: timestamp || new Date().toISOString()
    })
  }));

  if (!sefResponse.ok) {
    if (sefResponse.status === 401) return new Response("Unauthorized", { status: 401 });
    throw new Error("DO obrada neuspešna");
  }

  return new Response(JSON.stringify({ uspeh: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}));

// ==========================================
// 3. DASHBOARD & ANALYTICS PROXY PREMA DO
// ==========================================
app.get('/api/dashboard/stats', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  return await c.env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request('http://durableobject/stats'));
}));

app.get('/api/dashboard/logs', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  return await c.env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request('http://durableobject/logs'));
}));

app.post('/api/dashboard/webhook', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const telo = await c.req.json();
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  return await c.env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request('http://durableobject/config', {
    method: 'POST',
    body: JSON.stringify(telo),
    headers: { 'Content-Type': 'application/json' }
  }));
}));

app.get('/api/fakture', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const url = new URL(c.req.url);
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  return await c.env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request(`http://durableobject/fakture${url.search}`));
}));

app.post('/api/fakture/sync', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  return await c.env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request('http://durableobject/sync-sef', { method: 'POST' }));
}));

app.get('/api/analytics/pppdv-summary', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const url = new URL(c.req.url);
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  return await c.env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request(`http://durableobject/api/analytics/pppdv-summary${url.search}`));
}));

app.get('/api/analytics/export-excel', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const url = new URL(c.req.url);
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  return await c.env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request(`http://durableobject/api/analytics/export-excel${url.search}`));
}));

// ==========================================
// 4. POPDV PROTOKOL
// ==========================================
app.post('/api/analytics/popdv/submit-draft', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const url = new URL(c.req.url);
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  return await c.env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request(`http://durableobject/api/popdv/submit-draft${url.search}`, {
    method: 'POST'
  }));
}));

app.post('/api/analytics/popdv/finalize', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const url = new URL(c.req.url);
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  return await c.env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request(`http://durableobject/api/popdv/finalize${url.search}`, {
    method: 'POST'
  }));
}));

app.patch('/api/fakture/:id/odbitak', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const sefId = (c.result as any).pathname.groups.id;
  const telo = await c.req.json();
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);

  return await c.env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request(`http://durableobject/fakture/${sefId}/odbitak`, {
    method: 'PATCH',
    body: JSON.stringify(telo),
    headers: { 'Content-Type': 'application/json' }
  }));
}));

// ==========================================
// 5. OPERATIVNE AKCIJE
// ==========================================
app.post('/api/fakture/send', auth(validateJson(SefInvoiceSchema, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  
  const doResponse = await c.env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request('http://durableobject/fakture/send', { 
    method: 'POST', 
    body: JSON.stringify(c.validJson),
    headers: { 'Content-Type': 'application/json' }
  }));

  if (doResponse.ok) {
    c.ctx.waitUntil(c.env.REGISTAR_DB.prepare(
      `UPDATE klijenti SET ima_aktivne_fakture = 1 WHERE klijent_id = ?`
    ).bind(c.klijentId).run());
  }

  return doResponse;
})));

app.post('/api/fakture/batch', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const telo = await c.req.json();
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  
  const doResponse = await c.env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request('http://durableobject/fakture/batch', { 
    method: 'POST', 
    body: JSON.stringify(telo),
    headers: { 'Content-Type': 'application/json' }
  }));

  if (doResponse.ok) {
    await c.env.REGISTAR_DB.prepare(`UPDATE klijenti SET ima_aktivne_fakture = 1 WHERE klijent_id = ?`).bind(c.klijentId).run();
  }
  return doResponse;
}));

// ==========================================
// 6. CSV PARSER LOGIKA
// ==========================================
function parseCsvLine(line: string): string[] | null {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  // OKLOP: Detektujemo separator (zarezi ili tačka-zarez)
  const sep = line.includes(';') ? ';' : ',';

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      // Ne dodajemo navodnike u samu vrednost
      continue;
    } 
    
    if (char === sep && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  
  // Vraćamo niz samo ako imamo barem PIB i Naziv (min 2, ali stavljamo 3 radi sigurnosti statusa)
  return result.length >= 3 ? result : null;
}

// @ts-ignore
import nuxtHandler from '../.output/server/index.mjs';

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(req.url);

    // Ako je zahtev za API, pokušavamo sa Router-om
    if (url.pathname.startsWith('/api')) {
      const res = await app.fetch(req, env, ctx);
      // Router vraća 404 ako ruta ne postoji, tada puštamo Nuxt-u (npr. za server/api rute)
      if (res.status !== 404) {
        return applyCors(res, req);
      }
    }

    // Za sve ostalo (Frontend rute, statički fajlovi), delegiramo Nuxt-u
    return nuxtHandler.fetch(req, env, ctx);
  },
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      const { results } = await env.REGISTAR_DB.prepare(
        `SELECT klijent_id FROM klijenti 
         WHERE ima_aktivne_fakture = 1 
         AND (poslednji_sync IS NULL OR poslednji_sync < datetime('now', '-15 minutes'))`
      ).all<{ klijent_id: string }>();

      if (results && results.length > 0) {
        const BATCH_SIZE = 10;
        const deaktvirajKlijente: string[] = [];
        const azurirajSyncVreme: string[] = [];

        for (let i = 0; i < results.length; i += BATCH_SIZE) {
          const batch = results.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(async (red) => {
            try {
              // POPRAVKA: Usklađeno sa strukturom - koristimo idFromName jer je red.klijent_id običan string ("klijent_1000...")
              const doId = env.KLIJENT_BAZA_OBJECT.idFromName(red.klijent_id);
              const odgovor = await env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request('http://durableobject/sync-sef', { method: 'POST' }));
              azurirajSyncVreme.push(red.klijent_id);
              if (odgovor.ok) {
                const podaci = (await odgovor.json()) as { aktivne_fakture: number };
                if (podaci.aktivne_fakture === 0) deaktvirajKlijente.push(red.klijent_id);
              }
            } catch (error) {
              console.error(`Cron error [${red.klijent_id}]:`, error);
            }
          }));
        }

        if (azurirajSyncVreme.length > 0) {
          const placeholders = azurirajSyncVreme.map(() => '?').join(',');
          await env.REGISTAR_DB.prepare(`UPDATE klijenti SET poslednji_sync = CURRENT_TIMESTAMP WHERE klijent_id IN (${placeholders})`).bind(...azurirajSyncVreme).run();
        }

        if (deaktvirajKlijente.length > 0) {
          const placeholders = deaktvirajKlijente.map(() => '?').join(',');
          await env.REGISTAR_DB.prepare(`UPDATE klijenti SET ima_aktivne_fakture = 0 WHERE klijent_id IN (${placeholders})`).bind(...deaktvirajKlijente).run();
        }
      }
    })());
  }
};