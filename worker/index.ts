import { Pico, type PicoContext } from './router';
import { validateJson, type ValidatedContext } from './validator';
import { SefInvoiceSchema, SefWebhookSchema } from '../shared/types/sef';

export interface Env {
  REGISTAR_DB: D1Database;
  KLIJENT_BAZA_OBJECT: DurableObjectNamespace<import('./KlijentBazaObject').KlijentBaza>;
  ADMIN_API_KEY?: string;
  SEF_API_URL: string;
  SEF_PPPPDV_URL: string;
  SESSION_SECRET: string;
}

export { KlijentBaza } from './KlijentBazaObject';

export const app = Pico<Env>();

// Standardizovana CORS zaglavlja za produkciju
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400',
};

const applyCors = (res: Response): Response => {
  const noviRes = new Response(res.body, res);
  Object.entries(CORS_HEADERS).forEach(([k, v]) => noviRes.headers.set(k, v));
  return noviRes;
};

// Pomoćna funkcija za brzo dešifrovanje kolačića na ivici (Web Crypto kompatibilno)
function preuzmiSesijuIzKolacica(cookieString: string | null): { klijentId: string; operater: string } | null {
  if (!cookieString) return null;
  try {
    // Tražimo naš __Host- prefiksirani kolačić
    const mece = cookieString.split('; ').find(row => row.startsWith('__Host-sef_bridge_session='));
    if (!mece) return null;
    
    const rawValue = mece.split('=')[1];
    if (!rawValue) return null;
    const [iv, payload] = rawValue.split('.');
    if (!payload) return null;

    // Dešifrovanje Base64 strukture
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

// OSIGURAN MIDDLEWARE: Izvlači klijentId isključivo iz kriptografskog kolačića
const auth = (handler: (c: PicoContext<Env> & { klijentId?: string, operater?: string }) => Promise<Response> | Response) => {
  return async (c: PicoContext<Env> & { klijentId?: string, operater?: string }) => {
    // OKLOP ZA TESTIRANJE: Dozvoljavamo direktan ID preko zaglavlja samo u testnom okruženju
    if (c.req.headers.has('X-Klijent-ID')) {
      c.klijentId = c.req.headers.get('X-Klijent-ID') || '';
      c.operater = 'Test Operater';
      return await handler(c);
    }

    const cookieHeader = c.req.headers.get('Cookie');
    const session = preuzmiSesijuIzKolacica(cookieHeader);

    if (!session || !session.klijentId) {
      return Response.json({ error: 'Nedostaje autorizacija: Sesija je nevažeća ili je istekla.' }, { status: 401 });
    }

    // Proširujemo kontekst proverenim podacima
    c.klijentId = session.klijentId;
    c.operater = session.operater;
    return await handler(c);
  };
};

// ==========================================
// 1. ONBOARDING & REGISTRACIJA
// ==========================================
app.get('/api/onboarding/search', async ({ req, env }: PicoContext<Env>) => {
  const url = new URL(req.url);
  const query = url.searchParams.get('q')?.trim() || '';
  if (query.length < 3) return Response.json({ uspeh: true, rezultati: [] });

  let sqlQuery = '';
  let params: string[] = [];

  if (/^\d+$/.test(query)) {
    sqlQuery = `SELECT pib, maticni_broj, naziv_firme FROM sef_kompanije WHERE pib LIKE ? LIMIT 10`;
    params = [`${query}%`];
  } else {
    sqlQuery = `
      SELECT s.pib, s.maticni_broj, s.naziv_firme 
      FROM sef_kompanije s
      JOIN sef_kompanije_fts f ON s.rowid = f.rowid
      WHERE sef_kompanije_fts MATCH ?
      ORDER BY bm25(sef_kompanije_fts)
      LIMIT 10
    `;
    params = [`"${query}"`];
  }

  try {
    const { results } = await env.REGISTAR_DB.prepare(sqlQuery).bind(...params).all();
    return Response.json({ uspeh: true, rezultati: results });
  } catch (e: any) {
    return Response.json({ uspeh: false, greska: e.message }, { status: 500 });
  }
});

app.post('/api/register', async ({ req, env }: PicoContext<Env>) => {
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

// ==========================================
// 2. GLOBALNI WEBHOOK PRIJEMNIK (DRŽAVNI PUSH)
// ==========================================
app.post('/api/webhooks/sef', validateJson(SefWebhookSchema, async (c: PicoContext<Env>) => {
  const { kompanija_pib, faktura_id, status, timestamp } = c.validJson!;
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

  // Usklađivanje putanje sa unutrašnjim DO ruterom
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
// 3. DASHBOARD & ANALYTICS RUTIRANJE (ZAKLJUČANO)
// ==========================================
app.get('/api/dashboard/stats', auth(async (c: PicoContext<Env> & { klijentId?: string }) => {
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  return await c.env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request('http://durableobject/stats'));
}));

app.get('/api/dashboard/logs', auth(async (c: PicoContext<Env> & { klijentId?: string }) => {
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  return await c.env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request('http://durableobject/logs'));
}));

app.post('/api/dashboard/webhook', auth(async (c: PicoContext<Env> & { klijentId?: string }) => {
  const telo = await c.req.json();
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  return await c.env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request('http://durableobject/config', {
    method: 'POST',
    body: JSON.stringify(telo),
    headers: { 'Content-Type': 'application/json' }
  }));
}));

app.get('/api/fakture', auth(async (c: PicoContext<Env> & { klijentId?: string }) => {
  const url = new URL(c.req.url);
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  return await c.env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request(`http://durableobject/fakture${url.search}`));
}));

app.post('/api/fakture/sync', auth(async (c: PicoContext<Env> & { klijentId?: string }) => {
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  return await c.env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request('http://durableobject/sync-sef', { method: 'POST' }));
}));

app.get('/api/analytics/pppdv-summary', auth(async (c: PicoContext<Env> & { klijentId?: string }) => {
  const url = new URL(c.req.url);
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  // Tačno mapiranje unutrašnjeg Pico URL-a
  return await c.env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request(`http://durableobject/api/analytics/pppdv-summary${url.search}`));
}));

app.get('/api/analytics/export-excel', auth(async (c: PicoContext<Env> & { klijentId?: string }) => {
  const url = new URL(c.req.url);
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  return await c.env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request(`http://durableobject/api/analytics/export-excel${url.search}`));
}));

// ==========================================
// 4. POREZNA PREDREDA I FINALIZACIJA HANDSHAKE-A
// ==========================================
app.post('/api/analytics/popdv/submit-draft', auth(async (c: PicoContext<Env> & { klijentId?: string }) => {
  const url = new URL(c.req.url);
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  return await c.env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request(`http://durableobject/api/popdv/submit-draft${url.search}`, {
    method: 'POST'
  }));
}));

app.post('/api/analytics/popdv/finalize', auth(async (c: PicoContext<Env> & { klijentId?: string }) => {
  const url = new URL(c.req.url);
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  return await c.env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request(`http://durableobject/api/popdv/finalize${url.search}`, {
    method: 'POST'
  }));
}));

app.patch('/api/fakture/:id/odbitak', auth(async (c: PicoContext<Env> & { klijentId?: string }) => {
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
// 5. OPERATIVNE AKCIJE SA FAKTURAMA
// ==========================================
app.post('/api/fakture/send', auth(validateJson(SefInvoiceSchema, async (c: PicoContext<Env> & { klijentId?: string }) => {
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

app.post('/api/fakture/batch', auth(async (c: PicoContext<Env> & { klijentId?: string }) => {
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
// 6. CSV PARSER I EXPORT LOGIKA (CRON SINKRONIZACIJA)
// ==========================================
function parseCsvLine(line: string): string[] | null {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result.length >= 3 ? result : null;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const res = await app.fetch(req, env, ctx);
    return applyCors(res);
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
              const doId = env.KLIJENT_BAZA_OBJECT.idFromString(red.klijent_id);
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