import { Router, type RouterContext } from './router';
import { validateJson } from './validator';
import { SefInvoiceSchema, SefWebhookSchema } from '../shared/types/sef';
import ComplianceWatcher from "./compliance-watcher";
import { SefClient } from '../shared/services/sefClient';
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

app.get('/api/debug/discover', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const config = await c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!)).getConfig();
  const sefClient = new SefClient({ 
    apiKey: config.sef_api_key, 
    environment: config.environment, 
    baseUrl: c.env.SEF_API_URL 
  });
  const results = await sefClient.discoverInvoices();
  return Response.json({ success: true, results });
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

app.get('/api/analytics/pppdv-summary', auth(async (c: RouterContext<Env> & { klijentId?: string }) => {
  const url = new URL(c.req.url);
  const period = url.searchParams.get('period');
  if (!period) return Response.json({ error: "Missing period" }, { status: 400 });
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!);
  const klijentDO = c.env.KLIJENT_BAZA_OBJECT.get(doId);
  return Response.json({ success: true, data: await klijentDO.getPppdvSummary(period) });
}));

app.post('/api/webhooks/sef', validateJson(SefWebhookSchema, async (c: RouterContext<Env>) => {
  const { kompanija_pib, faktura_id, status } = c.validJson!;
  const klijentId = `klijent_${kompanija_pib}`;
  const doId = c.env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);  
  const klijentDO = c.env.KLIJENT_BAZA_OBJECT.get(doId);
  await klijentDO.syncWithSef();
  return Response.json({ uspeh: true });
}));

// @ts-ignore
import nuxtHandler from '../.output/server/index.mjs';

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const corsHeaders = getCorsHeaders(req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

    const url = new URL(req.url);
    if (url.pathname.startsWith('/api')) {
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
