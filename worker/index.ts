import { Router, type RouterContext } from './router';
import { validateJson } from './validator';
import { SefInvoiceSchema, SefWebhookSchema, SefDespatchAdviceSchema, SefReceiptAdviceSchema } from '../shared/types/sef';
import { DespatchSchema } from '../shared/schemas/despatch';
import { ReceiptSchema } from '../shared/schemas/receipt';
import ComplianceWatcher from "./compliance-watcher";
import { SefUblBuilder, DespatchBuilder, ReceiptBuilder } from '@dlbr/ubl-sdk';
import { Archiver } from "../shared/services/Archiver";
import { SefClient } from '../shared/services/sefClient';
import { D1SyncBridge } from '../shared/services/D1SyncBridge';
import { KVRegistry } from './services/KVRegistry';
import { posaljiHotfixTelegramAlarm } from '../shared/services/telegram-notifier';

export interface Env extends globalThis.Env {
  ADMIN_API_KEY: string;
  SESSION_SECRET: string;
  SEF_API_URL: string;
  SEF_PPPPDV_URL: string;
  KLIJENT_BAZA_OBJECT: DurableObjectNamespace<import('./KlijentBazaObject').KlijentBaza>;
  REGISTAR_DB: D1Database;
  SEF_UBL_ARHIVA: R2Bucket;
  PORESKI_KV: KVNamespace;
  SEF_QUEUE: Queue<any>;
}
export { KlijentBaza } from './KlijentBazaObject';

export const app = Router<Env>();

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

app.get('/api/health', async () => {
  return Response.json({ status: 'ONLINE', system: 'SEF Bridge v4.15.8' });
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
    sqlQuery = `
      SELECT s.pib, s.maticni_broj, s.naziv_firme 
      FROM sef_kompanije s
      JOIN sef_kompanije_fts f ON s.rowid = f.rowid
      WHERE sef_kompanije_fts MATCH ?
      ORDER BY bm25(sef_kompanije_fts)
      LIMIT 10
    `;
    params = [query.includes(' ') ? query : `"${query}*"`];
  }

  try {
    const { results } = await env.REGISTAR_DB.prepare(sqlQuery).bind(...params).all();
    return Response.json({ uspeh: true, rezultati: results });
  } catch (e: any) {
    return Response.json({ uspeh: false, greska: e.message }, { status: 500 });
  }
});

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

  return Response.json({ success: true, klijent_id: klijentId });
});

app.get('/api/auth/session', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  return Response.json({ success: true, klijentId: c.klijentId });
}));

app.get('/api/webhook-setup', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  const klijentDO = c.env.KLIJENT_BAZA_OBJECT.get(doId);
  return Response.json(await klijentDO.getWebhookInstructions());
}));

app.get('/api/debug/dump-db', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  const klijentDO = c.env.KLIJENT_BAZA_OBJECT.get(doId);
  const data = await klijentDO.dumpDatabase();
  return Response.json(data);
}));

app.get('/api/dashboard/stats', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  const klijentDO = c.env.KLIJENT_BAZA_OBJECT.get(doId);
  return Response.json(await klijentDO.getStats());
}));

app.get('/api/dashboard/logs', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  const klijentDO = c.env.KLIJENT_BAZA_OBJECT.get(doId);
  return Response.json(await klijentDO.getLogs());
}));

app.get('/api/dokumenti/chain/:id', auth(async (c: RouterContext<Env> & { result?: any }) => {
  const bridge = new D1SyncBridge(c.env.REGISTAR_DB);
  const id = c.result?.pathname?.groups?.id;
  if (!id) return new Response('Missing ID', { status: 400 });
  const chain = await bridge.getDocumentChain(id);
  return Response.json({ success: true, chain: chain.results });
}));

app.post('/api/dashboard/webhook', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const telo = await c.req.json();
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  const klijentDO = c.env.KLIJENT_BAZA_OBJECT.get(doId);
  return Response.json(await klijentDO.setConfig(telo));
}));

app.get('/api/fakture', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const url = new URL(c.req.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  const klijentDO = c.env.KLIJENT_BAZA_OBJECT.get(doId);
  return Response.json(await klijentDO.getFakture(page));
}));

app.post('/api/fakture/sync', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  const klijentDO = c.env.KLIJENT_BAZA_OBJECT.get(doId);
  return Response.json(await klijentDO.syncWithSef());
}));

app.post('/api/otpremnice/send', auth(validateJson(DespatchSchema, async (c: RouterContext<Env> & { klijentId?: string, validJson?: any }) => {
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  const klijentDO = c.env.KLIJENT_BAZA_OBJECT.get(doId);
  
  const input = c.validJson!;
  
  // 1. FAIL-FAST QUOTA CHECK
  const checkRes = await klijentDO.fetch(new Request('http://do/api/internal/check-quota', {
    headers: { 'X-Test-Now': c.req.headers.get('X-Test-Now') || '' }
  }));
  if (!checkRes.ok) return checkRes;

  // 2. MAPPING FLAT -> UBL (D1 SSoT Architecture)
  const ublPayload = {
    ID: input.id,
    IssueDate: input.issueDate,
    DespatchDate: input.despatchDate,
    Supplier: { Pib: input.supplierPib, Name: 'PRODAVAC' }, // Name will be overridden in DO if needed
    Customer: { Pib: input.customerPib, Name: 'KUPAC' },
    Lines: input.lines.map((l: any) => ({
      ID: l.id,
      ItemName: l.name,
      DeliveredQuantity: l.quantity,
      UnitCode: l.unitCode
    })),
    BillingReference: input.billingReference
  };

  // 3. ATOMIC SEND
  const doResponse = await klijentDO.fetch(new Request('http://do/otpremnice/send', { 
    method: 'POST', 
    body: JSON.stringify(ublPayload),
    headers: { 
      'Content-Type': 'application/json',
      'X-Test-Now': c.req.headers.get('X-Test-Now') || ''
    }
  }));

  if (doResponse.ok && c.env.SEF_QUEUE) {
    const result = await doResponse.clone().json() as any;
    if (result.success && result.xml) {
      c.ctx.waitUntil((async () => {
        try {
          await c.env.SEF_QUEUE.send({ 
            id: result.internalId || input.id, 
            xml: result.xml, 
            pib: c.klijentId!.replace('klijent_', ''),
            tip: 'OTPREMNICA'
          });
        } catch (e) {
          console.error("Queue Archiving Error (Otpremnica):", e);
        }
      })());
    }
  }

  return doResponse;
})));

app.post('/api/prijemnice/receive', auth(validateJson(ReceiptSchema, async (c: RouterContext<Env> & { klijentId?: string, validJson?: any }) => {
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  const klijentDO = c.env.KLIJENT_BAZA_OBJECT.get(doId);

  const input = c.validJson!;

  // MAPPING FLAT -> UBL
  const ublPayload = {
    ID: input.id,
    IssueDate: input.issueDate,
    Supplier: { Pib: input.supplierPib, Name: 'PRODAVAC' },
    Customer: { Pib: input.customerPib, Name: 'KUPAC' },
    DespatchDocumentReference: input.despatchReference ? {
      ID: input.despatchReference.id,
      IssueDate: input.despatchReference.issueDate
    } : undefined,
    Lines: input.lines.map((l: any) => ({
      ID: l.id,
      ReceivedQuantity: l.receivedQuantity,
      UnitCode: l.unitCode,
      ShortQuantity: l.shortQuantity,
      RejectedQuantity: l.rejectedQuantity,
      RejectReason: l.rejectReason,
      ItemName: l.itemName,
      ItemIdentification: l.itemIdentification,
      DespatchLineID: l.despatchLineId
    })),
    Note: input.note
  };

  // ATOMIC RECEIVE (Prijemnica)
  const doResponse = await klijentDO.fetch(new Request('http://do/prijemnice/receive', { 
    method: 'POST', 
    body: JSON.stringify(ublPayload),
    headers: { 
      'Content-Type': 'application/json',
      'X-Test-Now': c.req.headers.get('X-Test-Now') || ''
    }
  }));

  if (doResponse.ok && c.env.SEF_QUEUE) {
    const result = await doResponse.clone().json() as any;
    if (result.success && result.xml) {
      c.ctx.waitUntil((async () => {
        try {
          await c.env.SEF_QUEUE.send({ 
            id: result.internalId || input.id, 
            xml: result.xml, 
            pib: c.klijentId!.replace('klijent_', ''),
            tip: 'PRIJEMNICA'
          });
        } catch (e) {
          console.error("Queue Archiving Error (Prijemnica):", e);
        }
      })());
    }
  }

  return doResponse;
})));
app.post('/api/fakture/send', auth(validateJson(SefInvoiceSchema, async (c: RouterContext<Env> & { klijentId?: string }) => {  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  const klijentDO = c.env.KLIJENT_BAZA_OBJECT.get(doId);

  // 1. FAIL-FAST QUOTA CHECK (Rešenje za 402/202 problem)
  const issueDate = c.validJson!.IssueDate || c.validJson!.datumIzdavanja || '';
  const checkRes = await klijentDO.fetch(new Request(`http://do/api/internal/check-quota?issueDate=${issueDate}`, {
    headers: { 'X-Test-Now': c.req.headers.get('X-Test-Now') || '' }
  }));
  if (!checkRes.ok) return checkRes;

  // 2. ATOMIC SEND (XML se generiše unutar DO-a)
  const doResponse = await klijentDO.fetch(new Request('http://do/fakture/send', { 
    method: 'POST', 
    body: JSON.stringify(c.validJson),
    headers: { 
      'Content-Type': 'application/json',
      'X-Test-Now': c.req.headers.get('X-Test-Now') || ''
    }
  }));

  if (doResponse.ok && c.env.SEF_QUEUE) {
    const result = await doResponse.clone().json() as any;
    if (result.success && result.xml) {
      c.ctx.waitUntil((async () => {
        try {
          await c.env.SEF_QUEUE.send({ 
            id: result.internalId || c.validJson!.ID || c.validJson!.broj, 
            xml: result.xml, 
            pib: c.klijentId!.replace('klijent_', '') 
          });
        } catch (e) {
          console.error("Queue Archiving Error:", e);
        }
      })());
    }
  }

  return doResponse;
})));

app.post('/api/fakture/batch', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const telo = await c.req.json();
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  const klijentDO = c.env.KLIJENT_BAZA_OBJECT.get(doId);
  return await klijentDO.fetch(new Request('http://do/fakture/batch', { 
    method: 'POST', 
    body: JSON.stringify(telo),
    headers: { 'Content-Type': 'application/json' }
  }));
}));

app.get('/api/analytics/pppdv-summary', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const url = new URL(c.req.url);
  const period = url.searchParams.get('period');
  if (!period) return Response.json({ error: "Missing period" }, { status: 400 });
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  const klijentDO = c.env.KLIJENT_BAZA_OBJECT.get(doId);
  return await klijentDO.fetch(new Request(`http://do/api/analytics/pppdv-summary?period=${period}`));
}));

app.get('/api/analytics/potrosnja', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  const klijentDO = c.env.KLIJENT_BAZA_OBJECT.get(doId);
  return await klijentDO.fetch('http://do/api/analytics/potrosnja');
}));

app.get('/api/analytics/export-excel', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const url = new URL(c.req.url);
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  return await c.env.KLIJENT_BAZA_OBJECT.get(doId).fetch(new Request(`http://do/api/analytics/export-excel${url.search}`));
}));

app.post('/api/agency/register', async ({ req, env }: RouterContext<Env>) => {
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${env.ADMIN_API_KEY}`) return new Response('Unauthorized', { status: 401 });

  const { naziv, email } = await req.json() as { naziv: string, email: string };
  const agencyId = crypto.randomUUID();
  const masterToken = `agt_${crypto.randomUUID().replace(/-/g, '')}`;

  await env.REGISTAR_DB.prepare("INSERT INTO agencije (id, naziv, email, master_token) VALUES (?, ?, ?, ?)")
    .bind(agencyId, naziv, email, masterToken).run();

  return Response.json({ success: true, agencyId, masterToken });
});

app.post('/api/agency/link-client', async ({ req, env }: RouterContext<Env>) => {
  const token = req.headers.get('X-Agency-Token');
  const agency = await env.REGISTAR_DB.prepare("SELECT id FROM agencije WHERE master_token = ?").bind(token).first() as any;
  if (!agency) return Response.json({ error: 'Nevalidan Agency Token' }, { status: 401 });

  const { pib_firme, tenant_id } = await req.json() as { pib_firme: string, tenant_id: string };
  await env.REGISTAR_DB.prepare("INSERT OR REPLACE INTO agencija_klijenti (agencija_id, pib_firme, tenant_klijent_id) VALUES (?, ?, ?)")
    .bind(agency.id, pib_firme, tenant_id).run();

  return Response.json({ success: true });
});

app.get('/api/agency/dashboard', async ({ env, req }: RouterContext<Env>) => {
  const token = req.headers.get('X-Agency-Token');
  if (!token) return Response.json({ error: 'Missing Agency Token' }, { status: 401 });

  const agency = await env.REGISTAR_DB.prepare("SELECT id FROM agencije WHERE master_token = ?").bind(token).first() as any;
  if (!agency) return Response.json({ error: 'Nevalidan Agency Token' }, { status: 401 });

  const klijenti = await env.REGISTAR_DB.prepare("SELECT pib_firme, tenant_klijent_id FROM agencija_klijenti WHERE agencija_id = ?")
    .bind(agency.id).all() as any;

  // Agregacija u paraleli da ne ubijemo DO i ne puknemo na timeout-u
  const results = await Promise.all(klijenti.results.map(async (k: any) => {
    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(k.tenant_klijent_id);
    const kDO = env.KLIJENT_BAZA_OBJECT.get(doId);
    try {
      const [statsRes, configRes] = await Promise.all([
        kDO.fetch('http://do/stats'),
        kDO.fetch('http://do/config')
      ]);
      const stats = await statsRes.json() as any;
      const config = await configRes.json() as any;

      return {
        pib: k.pib_firme,
        naziv: k.tenant_klijent_id,
        status: config.status_pretplate || 'AKTIVAN',
        krediti: config.limit_faktura || 0,
        stats: stats.stats
      };
    } catch (e) {
      return { pib: k.pib_firme, error: 'DO_OFFLINE' };
    }
  }));

  return Response.json({ success: true, klijenti: results });
});

app.post('/test/trigger-queue', async ({ env }: RouterContext<Env>) => {
  // Simuliramo dolazak poruka u Queue (Miniflare 4 workaround)
  // U produkciji ovo ide automatski, u testu moramo ručno da "poguramo"
  const messages = []; // Ovde bismo mogli da dohvatimo iz memorije ako bismo imali mock
  // Za sada, pošto testiraš R2, uradićemo direktan sync u DO ili test ruti
  return Response.json({ success: true });
});

app.post('/api/webhooks/sef', validateJson(SefWebhookSchema, async (c: RouterContext<Env>) => {  const { kompanija_pib, faktura_id, status } = c.validJson!;
  const klijentId = `klijent_${kompanija_pib}`;
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);  
  const klijentDO = c.env.KLIJENT_BAZA_OBJECT.get(doId);
  await klijentDO.syncWithSef();
  return Response.json({ uspeh: true });
}));

app.post('/api/webhooks/otpremnice', async (c: RouterContext<Env>) => {
  const { id, status, pib_kompanije } = await c.req.json() as any;
  const bridge = new D1SyncBridge(c.env.REGISTAR_DB);

  // 1. Ažuriranje statusa u D1 (SSoT)
  await c.env.REGISTAR_DB.prepare(
    "UPDATE dokumenti SET status = ?, azurirano_u = CURRENT_TIMESTAMP WHERE id = ? OR sef_id = ?"
  ).bind(status, id, id).run();

  await bridge.logEvent(id, status, 'Ažuriranje statusa preko webhook-a');

  // 2. Propagacija ka Durable Objectu za internu logiku (npr. reconciliation)
  if (pib_kompanije) {
    const klijentId = `klijent_${pib_kompanije}`;
    const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = c.env.KLIJENT_BAZA_OBJECT.get(doId);
    c.ctx.waitUntil(klijentDO.fetch(new Request('http://do/webhooks/despatch-update', {
      method: 'POST',
      body: JSON.stringify({ despatch_id: id, novi_status: status })
    })));
  }

  return Response.json({ success: true });
});

  // TEST & DEBUG ROUTES (Isolated in CI/Local)
  app.post('/test/seed', async ({ req, env }: RouterContext<Env>) => {
  const { klijentId, data } = await req.json() as any;
  const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);
  const klijentDO = env.KLIJENT_BAZA_OBJECT.get(doId);
  return await klijentDO.fetch(new Request('http://do/test/seed', { method: 'POST', body: JSON.stringify(data) }));
});

app.get('/stats', async ({ req, env }: RouterContext<Env>) => {
  const kId = req.headers.get('X-Klijent-ID');
  if (!kId) return new Response('Missing X-Klijent-ID', { status: 400 });
  const doId = env.KLIJENT_BAZA_OBJECT.idFromName(kId);
  return await env.KLIJENT_BAZA_OBJECT.get(doId).fetch('http://do/stats');
});

// @ts-ignore
import nuxtHandler from '../.output/server/index.mjs';

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const corsHeaders = getCorsHeaders(req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

    const url = new URL(req.url);
    if (url.pathname.startsWith('/api') || url.pathname.startsWith('/test')) {
      const res = await app.fetch(req, env, ctx);
      const corsRes = applyCors(res, req);
      
      if (res.status === 404) {
        const text = await res.clone().text();
        if (text === 'Not Found') {
          return nuxtHandler.fetch(req, env, ctx);
        }
      }
      return corsRes;
    }
    return nuxtHandler.fetch(req, env, ctx);
  },

  async queue(batch: MessageBatch<any>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        const { id, xml, pib } = msg.body;
        const now = new Date();
        const r2Key = `tenants/${pib}/${now.getFullYear()}/${(now.getMonth() + 1)}/${id}.xml`;
        await env.SEF_UBL_ARHIVA.put(r2Key, xml);
        msg.ack();
      } catch (err) {
        msg.retry();
      }
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      try {
        await ComplianceWatcher.checkSefUpdates(env);
      } catch (err) {}
    })());
  }
};
