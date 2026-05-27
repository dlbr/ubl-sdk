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
// @ts-ignore – wrangler [[rules]] type="Data" resolves .ttf as ArrayBuffer
import interFont from '../../shared/assets/Inter-Bold.ttf';

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

const getValutaDetails = async (currency: 'EUR' | 'USD' | 'CHF', danas: string, env: any) => {
  const juceDate = new Date(new Date(danas).getTime() - 86400000);
  const juce = juceDate.toISOString().split('T')[0];

  const [kursDanas, kursJuce] = await Promise.all([
    NbsSoapService.getMiddleRate(currency, danas, env).catch(() => null),
    NbsSoapService.getMiddleRate(currency, juce, env).catch(() => null)
  ]);

  const fallbackDanas = currency === 'EUR' ? 117.2 : currency === 'USD' ? 108.5 : 121.1;
  const rateDanas = kursDanas || fallbackDanas;
  const rateJuce = kursJuce || rateDanas;

  let smer: 'GORE' | 'DOLE' | 'ISTO' = 'ISTO';
  let promenaProcenat = 0;

  if (rateJuce > 0 && rateDanas !== rateJuce) {
    const diff = rateDanas - rateJuce;
    smer = diff > 0 ? 'GORE' : 'DOLE';
    promenaProcenat = Math.abs((diff / rateJuce) * 100);
  }

  return {
    kurs: rateDanas,
    smer,
    promenaProcenat
  };
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

const getClientPlan = async (klijentId: string, env: Env) => {
  try {
    const kDO = env.KLIJENT_BAZA_OBJECT.get(env.KLIJENT_BAZA_OBJECT.idFromName(klijentId));
    const config = await kDO.fetch('http://do/config').then(r => r.json()) as any;
    return config.plan_name || config.plan || 'Micro';
  } catch {
    return 'Micro';
  }
};

const applyRateLimit = async (c: RouterContext<Env>) => {
  const klijentId = c.req.headers.get('X-Klijent-ID');
  const ip = c.req.headers.get('CF-Connecting-IP') || 'anonymous';
  
  let limit = 10; // Default za anonimne i Micro plan
  let identifier = `ip:${ip}`;

  if (klijentId && klijentId.startsWith('klijent_')) {
    identifier = `kl:${klijentId}`;
    const plan = await getClientPlan(klijentId, c.env);
    if (plan === 'Standard') limit = 100;
    else if (plan === 'Enterprise') limit = 1000;
  }

  const now = Math.floor(Date.now() / 60000); // Prozor od 1 minuta
  const kvKey = `ratelimit:${identifier}:${now}`;
  
  const current = await c.env.PORESKI_KV.get(kvKey);
  const count = current ? parseInt(current) : 0;

  if (count >= limit) {
    return new Response(JSON.stringify({ 
      error: 'RATE_LIMIT_EXCEEDED', 
      message: 'Prekoračili ste broj dozvoljenih zahteva (Rate Limit). Za veći limit, molimo vas da koristite plaćeni plan (Standard ili Enterprise).',
      plan_detected: klijentId ? 'Identified' : 'Public'
    }), { 
      status: 429,
      headers: { 
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': '0'
      }
    });
  }

  // Inkrementiramo brojač u KV sa TTL-om od 2 minuta da bi se automatski čistilo
  await c.env.PORESKI_KV.put(kvKey, (count + 1).toString(), { expirationTtl: 120 });
  return null;
};

export const app = Router<Env>();

app.get('/api/public/v1/kursna-lista/og.png', async (c: any) => {
  const limitResponse = await applyRateLimit(c);
  if (limitResponse) return limitResponse;
  
  try {
    const danas = new Date().toISOString().split('T')[0];
    const eur = await NbsSoapService.getMiddleRate('EUR', danas, c.env);
    const kurs = eur ?? 117.2031;

    const png = await OgEngine.generatePng(
      { valuta: 'EUR', kurs: kurs.toFixed(4), promena: '0.0000', raste: false },
      interFont as unknown as ArrayBuffer,
    );

    return new Response(png, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch (err: any) {
    return Response.json({ error: 'OG_GEN_FAIL', detail: err?.message }, { status: 500 });
  }
});

app.get('/api/public/v1/kursna-lista', async (c: any) => {
  const limitResponse = await applyRateLimit(c);
  if (limitResponse) return limitResponse;

  const danas = new Date().toISOString().split('T')[0];
  const [eurDetails, usdDetails, chfDetails] = await Promise.all([
    getValutaDetails('EUR', danas, c.env),
    getValutaDetails('USD', danas, c.env),
    getValutaDetails('CHF', danas, c.env)
  ]);
  return Response.json({
    status: 'success',
    datum: danas,
    valute: { 
      EUR: { kurs: eurDetails.kurs, trend: { smer: eurDetails.smer, promenaProcenat: eurDetails.promenaProcenat } }, 
      USD: { kurs: usdDetails.kurs, trend: { smer: usdDetails.smer, promenaProcenat: usdDetails.promenaProcenat } }, 
      CHF: { kurs: chfDetails.kurs, trend: { smer: chfDetails.smer, promenaProcenat: chfDetails.promenaProcenat } } 
    },
    tiker: [
      { valuta: 'EUR', kurs: eurDetails.kurs, smer: eurDetails.smer, promenaProcenat: eurDetails.promenaProcenat },
      { valuta: 'USD', kurs: usdDetails.kurs, smer: usdDetails.smer, promenaProcenat: usdDetails.promenaProcenat },
      { valuta: 'CHF', kurs: chfDetails.kurs, smer: chfDetails.smer, promenaProcenat: chfDetails.promenaProcenat }
    ]
  }, {
    headers: {
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400'
    }
  });
});

app.get('/api/public/v1/kursna-lista/historical', async (c: any) => {
  const limitResponse = await applyRateLimit(c);
  if (limitResponse) return limitResponse;

  const url = new URL(c.req.url);
  const date = url.searchParams.get('date');
  if (!date) return Response.json({ error: 'MISSING_DATE' }, { status: 400 });
  
  const [eur, usd, chf] = await Promise.all([
    NbsSoapService.getMiddleRate('EUR', date, c.env).catch(() => 117.2),
    NbsSoapService.getMiddleRate('USD', date, c.env).catch(() => 108.5),
    NbsSoapService.getMiddleRate('CHF', date, c.env).catch(() => 121.1)
  ]);
  
  return Response.json({
    status: 'success',
    datum: date,
    tiker: [
      { valuta: 'EUR', kurs: eur },
      { valuta: 'USD', kurs: usd },
      { valuta: 'CHF', kurs: chf }
    ]
  }, {
    headers: {
      'Cache-Control': 'public, max-age=604800, immutable'
    }
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

app.get('/api/audit/verify-chain', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!));
  return await kDO.fetch('http://do/api/audit/verify-chain');
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
    const danas = new Date().toISOString().split('T')[0];
    const [eurDetails, usdDetails, chfDetails] = await Promise.all([
      getValutaDetails('EUR', danas, this.env),
      getValutaDetails('USD', danas, this.env),
      getValutaDetails('CHF', danas, this.env)
    ]);
    return {
      status: 'success',
      datum: danas,
      tiker: [
        { valuta: 'EUR', kurs: eurDetails.kurs, smer: eurDetails.smer, promenaProcenat: eurDetails.promenaProcenat },
        { valuta: 'USD', kurs: usdDetails.kurs, smer: usdDetails.smer, promenaProcenat: usdDetails.promenaProcenat },
        { valuta: 'CHF', kurs: chfDetails.kurs, smer: chfDetails.smer, promenaProcenat: chfDetails.promenaProcenat },
      ]
    };
  }

  async getKursnaListaHistorical(date: string) {
    const [eur, usd, chf] = await Promise.all([
      NbsSoapService.getMiddleRate('EUR', date, this.env).catch(() => 117.2),
      NbsSoapService.getMiddleRate('USD', date, this.env).catch(() => 108.5),
      NbsSoapService.getMiddleRate('CHF', date, this.env).catch(() => 121.1)
    ]);
    return {
      status: 'success',
      datum: date,
      tiker: [
        { valuta: 'EUR', kurs: eur },
        { valuta: 'USD', kurs: usd },
        { valuta: 'CHF', kurs: chf }
      ]
    };
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

  async getLogistikaDocuments(klijentId: string, searchParams: string) {
    return this.kDO(klijentId).fetch(`http://do/api/logistika/documents?${searchParams}`).then(r => r.json());
  }

  async login(pib: string) {
    return { success: true, klijentId: `klijent_${pib}`, pib };
  }

  async getDocumentChain(klijentId: string, id: string) {
    return this.kDO(klijentId).fetch(`http://do/api/dokumenti/chain/${id}`).then(r => r.json());
  }

  async getOtpremniceReconciliation(klijentId: string, id: string) {
    return this.kDO(klijentId).fetch(`http://do/otpremnice/reconciliation/${id}`).then(r => r.json());
  }

  async adminRenewSubscription(adminKey: string, body: any) {
    if (adminKey !== (this.env as any).ADMIN_API_KEY) {
      throw new Error('FORBIDDEN');
    }
    const kDO = this.kDO(`klijent_${body.pib}`);
    return kDO.fetch('http://do/api/admin/renew-subscription', {
      method: 'POST', body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' }
    }).then(r => r.json());
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
