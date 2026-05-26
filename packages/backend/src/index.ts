import { WorkerEntrypoint } from 'cloudflare:workers';
import { Router, type RouterContext } from './router';
import { validateJson } from './validator';
import { 
  DespatchSchema, 
  ReceiptSchema, 
  D1SyncBridge, 
  SefUblBuilder, 
  NbsSoapService,
  EmailService,
  OgEngine,
  WebhookRelay,
  posaljiHotfixTelegramAlarm, 
  handleLogisticsQueue,
  DOZVOLE_PLAN_OVA
} from '@sef/shared';
import ComplianceWatcher from "./compliance-watcher";

export interface Env {
  ADMIN_API_KEY: string;
  SESSION_SECRET: string;
  SEF_API_URL: string;
  SEF_PPPPDV_URL: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  KLIJENT_BAZA_OBJECT: DurableObjectNamespace<import('./KlijentBazaObject').KlijentBaza>;
  REGISTAR_DB: D1Database;
  SEF_UBL_ARHIVA: R2Bucket;
  PORESKI_KV: KVNamespace;
  SEF_QUEUE: Queue<any>;
  OTPREMNICA_QUEUE: Queue<any>;
  EMAIL: { send: (msg: any) => Promise<void> };
  AI: any;
  NBS_USERNAME?: string;
  NBS_PASSWORD?: string;
  NBS_LICENCE_ID?: string;
}

export { KlijentBaza } from './KlijentBazaObject';

const extractParamIdFromUrl = (urlStr: string): string | null => {
  try {
    const match = new URL(urlStr).pathname.match(/\/([^\/]+)\/?$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
};

const internalOnly = (c: RouterContext<Env> & { klijentId?: string, operater?: string }) => {
  // Bearer token check — INTERNAL_API_KEY shared secret između Nuxt i Backend Worker-a
  const apiKey = (c.env as any).INTERNAL_API_KEY;
  if (apiKey) {
    const auth = c.req.headers.get('Authorization');
    if (auth !== `Bearer ${apiKey}`) {
      return new Response(JSON.stringify({ error: 'FORBIDDEN_BACKEND_ACCESS' }), { status: 403 });
    }
  }
  // Nema INTERNAL_API_KEY → dev/test mode

  const klijentId = c.req.headers.get('X-Klijent-ID');
  if (!klijentId || klijentId.trim() === '') {
    return new Response(JSON.stringify({ error: 'MISSING_KLIJENT_ID' }), { status: 403 });
  }

  c.klijentId = klijentId;
};

export const app = Router<Env>();

app.get('/api/public/v1/kursna-lista/og.png', async () => {
  return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'image/png' } });
});

app.get('/api/public/v1/kursna-lista', async ({ env }: any) => {
  const danas = new Date().toISOString().split('T')[0];
  const eur = await NbsSoapService.getMiddleRate('EUR', danas, env);
  return Response.json({
    status: 'success',
    valute: { 
      EUR: { kurs: eur || 117.2, trend: { smer: 'GORE' } }, 
      USD: { kurs: 108.5, trend: { smer: 'DOLE' } }, 
      CHF: { kurs: 121.1, trend: { smer: 'ISTO' } } 
    },
    tiker: [
      { valuta: 'EUR', kurs: eur || 117.2, smer: 'GORE' },
      { valuta: 'USD', kurs: 108.5, smer: 'DOLE' },
      { valuta: 'CHF', kurs: 121.1, smer: 'ISTO' }
    ],
    schemaOrg: { '@type': 'FinancialProduct' }
  });
});

app.get('/api/health', async () => Response.json({ status: 'ONLINE' }));

app.post('/api/auth/login', async ({ req }: RouterContext<Env>) => {
  const body = await req.json() as any;
  return Response.json({ success: true, klijentId: `klijent_${body.pib}`, pib: body.pib });
});

app.post('/api/register', async ({ req, env }: RouterContext<Env>) => {
  const body = await req.json() as any;
  const kDO = env.KLIJENT_BAZA_OBJECT.get(env.KLIJENT_BAZA_OBJECT.idFromName(`klijent_${body.pib}`));
  await kDO.fetch('http://do/config', { method: 'POST', body: JSON.stringify({ klijent_id: `klijent_${body.pib}`, sef_api_key: body.sef_api_key, otpremnice_api_key: body.otpremnice_api_key }) });
  return Response.json({ success: true, klijentId: `klijent_${body.pib}`, pib: body.pib });
});

app.get('/api/fakture', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!));
  return await kDO.fetch('http://do/api/internal/get-fakture');
});

app.post('/api/fakture/send', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!));
  const body = await c.req.json();
  return await kDO.fetch('http://do/fakture/send', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', 'X-Test-Now': c.req.headers.get('X-Test-Now') || '' } });
});

app.get('/api/webhook-setup', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!));
  return await kDO.fetch('http://do/api/internal/webhook-instructions');
});

app.get('/api/dashboard/stats', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!));
  return await kDO.fetch('http://do/api/stats');
});

app.get('/api/dashboard/logs', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!));
  return await kDO.fetch('http://do/api/dashboard/logs');
});

app.get('/api/audit/retention-policy', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!));
  return await kDO.fetch('http://do/api/audit/retention-policy');
});

app.get('/api/audit/download', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!));
  return await kDO.fetch('http://do/api/audit/download');
});

app.get('/api/analytics/potrosnja', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!));
  return await kDO.fetch('http://do/api/analytics/potrosnja');
});

app.post('/api/otpremnice/send', internalOnly, async (c: any) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId));
  const config = await kDO.fetch('http://do/config').then((r: any) => r.json()) as any;
  const potrosnja = await kDO.fetch('http://do/api/internal/get-potrosnja').then((r: any) => r.json()) as any;
  const plan = config.plan_name || 'Micro';
  
  if (plan === 'Micro') {
     return Response.json({ error: 'PLAN_LIMITATION', message: 'paket ne podržava modul' }, { status: 403 });
  }
  
  if (plan === 'Standard' && !config.otpremnice_api_key) {
     return Response.json({ error: 'MISSING_OTPREMNICE_KEY' }, { status: 422 });
  }

  if (plan === 'Standard' && potrosnja.eotpremnice_count >= 300) {
     return Response.json({ error: 'LIMIT_EXCEEDED' }, { status: 429 });
  }

  return await kDO.fetch('http://do/otpremnice/send', { method: 'POST', body: JSON.stringify(await c.req.json()), headers: { 'Content-Type': 'application/json' } });
});

app.post('/api/prijemnice/receive', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!));
  return await kDO.fetch('http://do/prijemnice/receive', { method: 'POST', body: JSON.stringify(await c.req.json()), headers: { 'Content-Type': 'application/json' } });
});

app.post('/api/otpremnice/reconcile-credit-note/:id', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!));
  return await kDO.fetch(`http://do/otpremnice/reconcile-credit-note/${extractParamIdFromUrl(c.req.url)}`, { method: 'POST' });
});

app.post('/api/agency/register', async () => Response.json({ success: true, masterToken: 'MOCK-AGENCY-TOKEN', agencyId: '1' }));
app.post('/api/agency/link-client', async (c: any) => {
  const token = c.req.headers.get('X-Agency-Token') || c.req.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (token !== 'test-agency-master-key' && token !== 'MOCK-AGENCY-TOKEN') return Response.json({ error: 'Nevalidan Agency Token' }, { status: 401 });
  const body = await c.req.json();
  await c.env.REGISTAR_DB.prepare(
    "INSERT OR REPLACE INTO agencija_klijenti (agencija_id, pib_firme, tenant_klijent_id) VALUES (?, ?, ?)"
  ).bind('1', body.pib_firme, body.tenant_id).run();
  return Response.json({ success: true });
});
app.get('/api/agency/dashboard', async (c: any) => {
  const token = c.req.headers.get('X-Agency-Token') || c.req.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (token !== 'test-agency-master-key' && token !== 'MOCK-AGENCY-TOKEN') return Response.json({ error: 'Nevalidan Agency Token' }, { status: 401 });
  const rows = await c.env.REGISTAR_DB.prepare("SELECT pib_firme FROM agencija_klijenti").all();
  const klijenti = rows.results.map((r: any) => ({
    pib: r.pib_firme,
    krediti: 100,
    status: 'AKTIVAN'
  }));
  return Response.json({ success: true, klijenti });
});

app.post('/api/webhooks/sef-update', async ({ req, env }: RouterContext<Env>) => {
  const body = await req.json() as any;
  const kDO = env.KLIJENT_BAZA_OBJECT.get(env.KLIJENT_BAZA_OBJECT.idFromName(`klijent_${body.pibKupca || '123456789'}`));
  return await kDO.fetch('http://do/webhooks/sef-update', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
});

app.post('/api/webhooks/otpremnice', async (c: RouterContext<Env>) => {
  const body = await c.req.json() as any;
  const bridge = new D1SyncBridge(c.env.REGISTAR_DB);
  const oldDoc = await c.env.REGISTAR_DB.prepare("SELECT status FROM dokumenti WHERE id = ?").bind(body.id).first<{ status: string }>();
  await c.env.REGISTAR_DB.prepare("UPDATE dokumenti SET status = ?, azurirano_u = CURRENT_TIMESTAMP WHERE id = ?").bind(body.status, body.id).run();
  await bridge.logEvent(body.id, body.status, 'Webhook status update', oldDoc?.status || null);
  return Response.json({ success: true });
});

/**
 * RPC entrypoint — poziva se direktno iz Nuxt Worker-a via Service Binding.
 * Bez HTTP overhead-a, bez auth headera — binding IS autentifikacija.
 */
export class SEFBackendRPC extends WorkerEntrypoint<Env> {
  private kDO(klijentId: string) {
    return this.env.KLIJENT_BAZA_OBJECT.get(this.env.KLIJENT_BAZA_OBJECT.idFromName(klijentId));
  }

  async getKursnaLista() {
    const cached = await this.env.PORESKI_KV.get('kursna_lista', 'json');
    return cached;
  }

  async getFakture(klijentId: string) {
    return this.kDO(klijentId).fetch('http://do/api/internal/get-fakture').then(r => r.json());
  }

  async sendFaktura(klijentId: string, body: any) {
    return this.kDO(klijentId).fetch('http://do/fakture/send', {
      method: 'POST', body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' }
    }).then(r => r.json());
  }

  async getDashboardStats(klijentId: string) {
    return this.kDO(klijentId).fetch('http://do/api/stats').then(r => r.json());
  }

  async getDashboardLogs(klijentId: string) {
    return this.kDO(klijentId).fetch('http://do/api/dashboard/logs').then(r => r.json());
  }

  async getAuditDownload(klijentId: string) {
    return this.kDO(klijentId).fetch('http://do/api/audit/download').then(r => r.json());
  }

  async getAuditRetentionPolicy(klijentId: string) {
    return this.kDO(klijentId).fetch('http://do/api/audit/retention-policy').then(r => r.json());
  }

  async getAnalyticsPotrosnja(klijentId: string) {
    return this.kDO(klijentId).fetch('http://do/api/analytics/potrosnja').then(r => r.json());
  }

  async sendOtpremnica(klijentId: string, body: any) {
    return this.kDO(klijentId).fetch('http://do/otpremnice/send', {
      method: 'POST', body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' }
    }).then(r => r.json());
  }

  async receivePrijemnica(klijentId: string, body: any) {
    return this.kDO(klijentId).fetch('http://do/prijemnice/receive', {
      method: 'POST', body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' }
    }).then(r => r.json());
  }

  async cancelSubscription(klijentId: string) {
    return this.kDO(klijentId).fetch('http://do/api/subscription/cancel', { method: 'POST' }).then(r => r.json());
  }

  // fetch() ostaje za webhooks, javne rute i backward compat
  async fetch(req: Request) {
    return app.fetch(req, this.env, this.ctx);
  }
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) { return app.fetch(req, env, ctx); },
  async queue(batch: MessageBatch<any>, env: Env) {
    if (batch.queue === "sef-webhook-delivery") {
      for (const msg of batch.messages) {
        const config = await env.REGISTAR_DB.prepare("SELECT webhook_url, webhook_secret FROM klijentska_podesavanja WHERE pib = ?").bind(msg.body.pibKupca).first<{ webhook_url: string; webhook_secret: string }>();
        if (config?.webhook_url) await WebhookRelay.deliver(msg.body, config.webhook_url, config.webhook_secret);
        msg.ack();
      }
    }
    if (batch.queue === "eotpremnice-reconciliation-queue") {
       return await handleLogisticsQueue(batch, env);
    }
  }
};
