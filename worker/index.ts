import { Router, type RouterContext } from './router';
import { validateJson } from './validator';
import { SefInvoiceSchema, SefWebhookSchema } from '../shared/types/sef';
import ComplianceWatcher from "./compliance-watcher";
import { SefClient } from '../shared/services/sefClient';
import { KVRegistry } from './services/KVRegistry';
import { posaljiHotfixTelegramAlarm } from '../shared/services/telegram-notifier';

export interface Env extends globalThis.Env {
  ADMIN_API_KEY: string;
  // Add other secrets not in wrangler.toml here if needed
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
// MONITORING & ERROR SHIELD
// ==========================================
import { ErrorShield } from '../shared/services/errorShield';
import type { SefErrorBody } from '../shared/services/errorShield';

async function handleSefResponse(env: Env, invoiceId: string, status: number, body: SefErrorBody) {
  const severity = await ErrorShield.handle(env, invoiceId, status, body);
  
  if (severity === 'AUTH_ERR') {
    console.warn(`[Edge Monitor] AUTH GREŠKA na ${invoiceId}. Potrebna rotacija ključa.`);
    // Trigger internal key rotation logic if needed
  }
  
  return severity;
}

app.get('/api/test/telegram', async ({ env }: { env: Env }) => {
  const mockError = "SEF_API_ERROR (400): Schematron violation [Rule: SRB-380-01] - New mandatory element missing.";
  await posaljiHotfixTelegramAlarm(mockError, "FKT-TEST-BOT-001", env);
  return Response.json({ success: true, message: "Test alarm poslat na Telegram." });
});

app.get('/api/health', async () => {
  const circuit = SefClient.getCircuitStatus();
  return Response.json({ 
    status: 'ONLINE',
    system: 'SEF Bridge v4.17.0',
    circuit_breaker: circuit.isOpen ? 'OPEN' : 'CLOSED',
    circuit_open_until: circuit.openUntil || null,
    legal_compliance: 'MFIN 2026 UBL 2.1 (Hotfix 3.17.1)',
    archival_state: 'R2-ACTIVE'
  });
});

app.post('/api/admin/populate-companies', async ({ req, env }: RouterContext<Env>) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${env.ADMIN_API_KEY}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { sef_api_key } = await req.json() as { sef_api_key: string };
  if (!sef_api_key) return Response.json({ error: 'sef_api_key is required' }, { status: 400 });

  const sefClient = new SefClient({ 
    apiKey: sef_api_key, 
    baseUrl: env.SEF_API_URL,
    environment: 'production'
  });

  try {
    const csvContent = await sefClient.downloadAllCompanies();
    if (!csvContent) {
      return Response.json({ success: false, error: 'Odsustvo odziva ili prazan sadržaj sa SEF-a.' }, { status: 502 });
    }

    const lines = csvContent.split('\n');
    const headerLine = lines[0];
    if (!headerLine) return Response.json({ error: 'Missing header' });
    
    const headerCols = parseCsvLine(headerLine);
    if (!headerCols) return Response.json({ error: 'Invalid header' });

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

    if (statements.length > 0) {
      await env.REGISTAR_DB.batch(statements);
      processed += statements.length;
    }

    return Response.json({ 
      success: true, 
      message: `Centralni SEF registar uspešno ažuriran. Indeksirano: ${processed} kompanija.`,
      header: headerLine
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
    baseUrl: env.SEF_API_URL,
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

async function preuzmiSesijuIzKolacica(cookieString: string | null, env: Env): Promise<{ klijentId: string; operater: string } | null> {
  if (!cookieString) return null;
  try {
    const mece = cookieString.split('; ').find(row => row.startsWith('__Host-sef_bridge_session='));
    if (!mece) return null;
    
    let rawValue = mece.split('=')[1];
    if (!rawValue) return null;

    rawValue = decodeURIComponent(rawValue);
    return await SessionEngine.unseal(rawValue, env.SESSION_SECRET);
  } catch {
    return null;
  }
}

const auth = (handler: (c: RouterContext<Env> & { klijentId?: string, operater?: string }) => Promise<Response> | Response) => {
  return async (c: RouterContext<Env> & { klijentId?: string, operater?: string }) => {
    // OKLOP: Trust X-Klijent-ID header ONLY if it has a non-empty value
    const headerKlijentId = c.req.headers.get('X-Klijent-ID');
    if (headerKlijentId && headerKlijentId.trim() !== '') {
      c.klijentId = headerKlijentId;
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

app.post('/api/register', async ({ req, env }: RouterContext<Env>) => {
  const { pib, naziv, sef_api_key } = await req.json() as { pib: string, naziv: string, sef_api_key: string };
  if (!pib || !sef_api_key) return Response.json({ error: 'PIB i SEF API Key su obavezni' }, { status: 400 });

  const klijentId = `klijent_${pib}`;

  await env.REGISTAR_DB.prepare(
    `INSERT INTO klijenti (klijent_id, naziv, ima_aktivne_fakture, poslednji_sync) VALUES (?, ?, 0, CURRENT_TIMESTAMP)
     ON CONFLICT(klijent_id) DO UPDATE SET naziv = excluded.naziv`
  ).bind(klijentId, naziv || klijentId).run();

  const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);
  const klijentDO = env.KLIJENT_BAZA_OBJECT.get(doId);
  
  await klijentDO.setConfig({ 
    sef_api_key, 
    klijent_id: klijentId,
    plan: 'Micro', 
    limit: 50 
  });

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

app.post('/api/webhooks/sef', validateJson(SefWebhookSchema, async (c: RouterContext<Env>) => {
  const { kompanija_pib, faktura_id, status, broj_fakture, timestamp } = c.validJson!;
  
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

app.get('/api/auth/session', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  return Response.json({
    success: true,
    klijentId: c.klijentId,
    timestamp: Date.now()
  });
}));

app.get('/api/webhook-setup', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  console.log(`[Worker] Match /api/webhook-setup for ${c.klijentId}`);
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  const klijentDO = c.env.KLIJENT_BAZA_OBJECT.get(doId);
  const data = await klijentDO.getWebhookInstructions();
  return Response.json(data);
}));

app.get('/api/webhook-setup/', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  console.log(`[Worker] Match /api/webhook-setup/ for ${c.klijentId}`);
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  const klijentDO = c.env.KLIJENT_BAZA_OBJECT.get(doId);
  const data = await klijentDO.getWebhookInstructions();
  return Response.json(data);
}));

app.get('/api/dashboard/stats', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  const klijentDO = c.env.KLIJENT_BAZA_OBJECT.get(doId);
  const stats = await klijentDO.getStats();
  return Response.json(stats);
}));

app.get('/api/dashboard/logs', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  const klijentDO = c.env.KLIJENT_BAZA_OBJECT.get(doId);
  const logs = await klijentDO.getLogs();
  return Response.json(logs);
}));

app.post('/api/fakture/batch', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const telo = await c.req.json();
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  const klijentDO = c.env.KLIJENT_BAZA_OBJECT.get(doId);
  
  // Refactor to use sendInvoice in a loop or implement batch RPC
  const results = [];
  for (const f of telo.fakture) {
    results.push(await klijentDO.sendInvoice(f, c.req.headers.get('X-Test-Now')));
  }
  return Response.json({ success: true, results });
}));

app.get('/api/fakture', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const url = new URL(c.req.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  const klijentDO = c.env.KLIJENT_BAZA_OBJECT.get(doId);
  const data = await klijentDO.getFakture(page);
  return Response.json(data);
}));

app.post('/api/fakture/sync', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  const klijentDO = c.env.KLIJENT_BAZA_OBJECT.get(doId);
  const result = await klijentDO.syncWithSef();
  return Response.json(result);
}));

app.get('/api/analytics/pppdv-summary', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const url = new URL(c.req.url);
  const period = url.searchParams.get('period');
  if (!period) return Response.json({ error: "Missing period" }, { status: 400 });
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  const klijentDO = c.env.KLIJENT_BAZA_OBJECT.get(doId);
  const data = await klijentDO.getPppdvSummary(period);
  return Response.json({ success: true, data });
}));

app.get('/api/analytics/export-excel', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const url = new URL(c.req.url);
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  return await c.env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request(`http://durableobject/api/analytics/export-excel${url.search}`));
}));

app.post('/api/analytics/popdv/submit-draft', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const url = new URL(c.req.url);
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  return await c.env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request(`http://durableobject/popdv/submit-draft${url.search}`, {
    method: 'POST'
  }));
}));

app.post('/api/analytics/popdv/finalize', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const url = new URL(c.req.url);
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  return await c.env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request(`http://durableobject/popdv/finalize${url.search}`, {
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

app.post('/api/fakture/send', auth(validateJson(SefInvoiceSchema, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);

  const doResponse = await c.env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request('http://durableobject/fakture/send', { 
    method: 'POST',
    body: JSON.stringify(c.validJson),
    headers: { 
      'Content-Type': 'application/json',
      'X-Test-Now': c.req.headers.get('X-Test-Now') || ''
    }
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
    headers: { 
      'Content-Type': 'application/json',
      'X-Test-Now': c.req.headers.get('X-Test-Now') || ''
    }
  }));

  if (doResponse.ok) {
    c.ctx.waitUntil(c.env.REGISTAR_DB.prepare(
      `UPDATE klijenti SET ima_aktivne_fakture = 1 WHERE klijent_id = ?`
    ).bind(c.klijentId).run());
  }

  return doResponse;
}));

function parseCsvLine(line: string): string[] | null {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  const sep = line.includes(';') ? ';' : ',';

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
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
  return result.length >= 3 ? result : null;
}

// @ts-ignore
import nuxtHandler from '../.output/server/index.mjs';

import { Retriever } from './services/Retriever';

// ... (ostatak koda)

app.get('/api/admin/retrieve/:invoiceId', async (c: RouterContext<Env>) => {
  const { env } = c;
  const invoiceId = (c.result as any).pathname.groups.invoiceId;
  
  try {
    const xml = await Retriever.pullInvoice(env, invoiceId);
    return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 404 });
  }
});
app.get('/api/v1/sifrarnici/jedinice-mera', async ({ env }: RouterContext<Env>) => {
  const mere = await env.PORESKI_KV.get("DRZAVNE_JEDINICE_MERA", "json");
  return Response.json(mere || ["H87", "PCE", "KGM", "SET"]);
});

app.get('/api/v1/sifrarnici/poreska-pravila', async ({ env }: RouterContext<Env>) => {
  const pravila = await env.PORESKI_KV.get("DRZAVNA_PORESKA_PRAVILA_RS", "json");
  return Response.json(pravila || { OPSTA_STOPA: 20.00, POSEBNA_STOPA: 10.00 });
});

// ==========================================
// 7. AGENCY DASHBOARD & MULTI-TENANT GATEWAY
// ==========================================

// Middleware za proveru Agency Token-a
const agencyAuth = (handler: (c: RouterContext<Env> & { agencyId: string }) => Promise<Response> | Response) => {
  return async (c: RouterContext<Env> & { agencyId?: string }) => {
    const token = c.req.headers.get('X-Agency-Token');
    if (!token) return Response.json({ error: 'Nedostaje X-Agency-Token' }, { status: 401 });

    const agency = await c.env.REGISTAR_DB.prepare(
      `SELECT id FROM agencije WHERE master_token = ?`
    ).bind(token).first<{ id: string }>();

    if (!agency) return Response.json({ error: 'Nevalidan Agency Token' }, { status: 401 });

    c.agencyId = agency.id;
    return await handler(c as any);
  };
};

app.post('/api/agency/register', async ({ req, env }: RouterContext<Env>) => {
  const authHeader = req.headers.get('Authorization');
  const expectedAuth = `Bearer ${env.ADMIN_API_KEY || 'admin_secret'}`;
  
  if (authHeader !== expectedAuth) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { naziv, email } = await req.json() as { naziv: string, email: string };
  const agencyId = `agency_${crypto.randomUUID().substring(0,8)}`;
  const masterToken = `AT-${crypto.randomUUID().replace(/-/g, '')}`;

  await env.REGISTAR_DB.prepare(
    `INSERT INTO agencije (id, naziv, email, master_token) VALUES (?, ?, ?, ?)`
  ).bind(agencyId, naziv, email, masterToken).run();

  return Response.json({ success: true, agencyId, masterToken });
});

app.post('/api/agency/link-client', agencyAuth(async (c) => {
  const { pib_firme, tenant_id } = await c.req.json() as { pib_firme: string, tenant_id: string };
  
  await c.env.REGISTAR_DB.prepare(
    `INSERT OR REPLACE INTO agencija_klijenti (agencija_id, pib_firme, tenant_klijent_id) VALUES (?, ?, ?)`
  ).bind(c.agencyId, pib_firme, tenant_id).run();

  return Response.json({ success: true });
}));

app.get('/api/agency/dashboard', agencyAuth(async (c) => {
  const klijenti = await c.env.REGISTAR_DB.prepare(
    `SELECT pib_firme, tenant_klijent_id FROM agencija_klijenti WHERE agencija_id = ?`
  ).bind(c.agencyId).all<{ pib_firme: string, tenant_klijent_id: string }>();

  if (!klijenti.results || klijenti.results.length === 0) return Response.json({ klijenti: [] });

  // Paralelna agregacija podataka sa ivice mreže
  const rezultati = await Promise.all(klijenti.results.map(async (k) => {
    try {
      const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(k.tenant_klijent_id);
      const res = await c.env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request('http://do/stats'));
      const stats = await res.json() as any;
      return {
        pib: k.pib_firme,
        status: stats.status || stats.status_pretplate || 'UNKNOWN',
        krediti: stats.ledger_saldo || 0,
        aktivne_fakture: stats.total_sales || 0
      };
    } catch (e) {
      return { pib: k.pib_firme, error: "DO_UNREACHABLE" };
    }
  }));

  return Response.json({ klijenti: rezultati });
}));

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const corsHeaders = getCorsHeaders(req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

    // Inicijalizacija D1 tabela ako ne postoje (pojednostavljena migracija u letu)
    if (req.url.includes('/api/agency/')) {
       await env.REGISTAR_DB.prepare(`CREATE TABLE IF NOT EXISTS agencije (id TEXT PRIMARY KEY, naziv TEXT, email TEXT, master_token TEXT UNIQUE, kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP)`).run();
       await env.REGISTAR_DB.prepare(`CREATE TABLE IF NOT EXISTS agencija_klijenti (agencija_id TEXT, pib_firme TEXT PRIMARY KEY, tenant_klijent_id TEXT, kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP)`).run();
    }

    const url = new URL(req.url);
    
    // OKLOP: Detaljan debug za rute koje failuju
    if (url.pathname.includes('webhook-setup')) {
      console.log(`[Router Debug] Incoming: ${req.method} ${url.pathname}`);
    }

    if (url.pathname.startsWith('/api')) {
      const res = await app.fetch(req, env, ctx);
      const corsRes = applyCors(res, req);
      
      if (res.status === 404) {
        const text = await res.clone().text();
        if (text === 'Not Found') {
          console.warn(`[Router Fallback] ${url.pathname} not in Worker, passing to Nuxt.`);
          return nuxtHandler.fetch(req, env, ctx);
        }
      }
      return corsRes;
    }
    return nuxtHandler.fetch(req, env, ctx);
  },

  async queue(batch: MessageBatch<any>, env: Env): Promise<void> {
    console.log(`[Queue] Processing ${batch.messages.length} compliance-queued invoices...`);
    
    for (const msg of batch.messages) {
      try {
        const { id, xml, responseData, klijentId, pib } = msg.body;
        
        // 1. Arhiviraj u R2
        const now = new Date();
        const r2Key = `tenants/${pib}/${now.getFullYear()}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${id}_${now.toISOString().replace(/[:.]/g, '-')}.xml`;
        
        await env.SEF_UBL_ARHIVA.put(r2Key, xml, {
          httpMetadata: { contentType: "text/xml" }
        });

        // 2. Indeksiraj u KV
        await KVRegistry.saveStatus(env, id, 'PROKNJIŽENO', r2Key);
        
        msg.ack();
      } catch (err) {
        console.error(`[Queue] Failed to archive invoice:`, err);
        msg.retry();
      }
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      // 1. LIVE METADATA SYNC (Every 6 hours / Cron)
      const sefClient = new SefClient({ 
        apiKey: env.ADMIN_API_KEY, 
        baseUrl: env.SEF_API_URL || 'https://efaktura.mfin.gov.rs/api',
        environment: 'production'
      });

      try {
        const mere = await sefClient.getUnitMeasures();
        if (mere) {
          await env.PORESKI_KV.put("DRZAVNE_JEDINICE_MERA", JSON.stringify(mere));
          console.log(`[Cron] Uspešno ažurirano ${mere.length} jedinica mera iz državnog šifrarnika.`);
        }
      } catch (err) {
        console.error("[Cron] Greška pri sinhronizaciji šifrarnika:", err);
      }

      // v3.9.0: SEF COMPLIANCE WATCHER
      try {
        await ComplianceWatcher.checkSefUpdates(env);
      } catch (err) {
        console.error("[Cron] Compliance Watcher fail:", err);
      }

      // 2. CLIENT STATUS SYNC
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
