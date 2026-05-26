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
  const klijentId = c.req.headers.get('X-Klijent-ID');
  const operater = c.req.headers.get('X-Operater') || 'Sistemski Operater';
  if (!klijentId || klijentId.trim() === '') {
    return new Response(JSON.stringify({ error: 'FORBIDDEN_BACKEND_ACCESS', message: 'Zabranjen direktan pristup.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  c.klijentId = klijentId;
  c.operater = operater;
};

export const app = Router<Env>();

// --- PUBLIC SEO ROUTES ---
app.get('/api/public/v1/kursna-lista/og.png', async (c) => {
  const danas = new Date().toISOString().split('T')[0];
  const juceDate = new Date(); juceDate.setDate(juceDate.getDate() - 1);
  const juce = juceDate.toISOString().split('T')[0];
  try {
    const [eur, eurJuce] = await Promise.all([NbsSoapService.getMiddleRate('EUR', danas, c.env as any), NbsSoapService.getMiddleRate('EUR', juce, c.env as any)]);
    const proc = eurJuce !== 0 ? ((eur - eurJuce) / eurJuce) * 100 : 0;
    // @ts-ignore
    const fontBuffer = await import('@sef/shared/assets/Inter-Bold.ttf').then(m => m.default);
    const png = await OgEngine.generatePng({ valuta: 'EUR', kurs: eur.toFixed(4), promena: Math.abs(proc).toFixed(4), raste: eur >= eurJuce }, fontBuffer);
    return new Response(png, { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' } });
  } catch (err: any) { return new Response(JSON.stringify({ error: 'OG_GEN_FAIL', message: err.message }), { status: 500 }); }
});

app.get('/api/public/v1/kursna-lista', async (c) => {
  const danas = new Date().toISOString().split('T')[0];
  const juceDate = new Date(); juceDate.setDate(juceDate.getDate() - 1);
  const juce = juceDate.toISOString().split('T')[0];
  try {
    const [eur, usd, chf, eurJuce, usdJuce, chfJuce] = await Promise.all([
      NbsSoapService.getMiddleRate('EUR', danas, c.env as any), NbsSoapService.getMiddleRate('USD', danas, c.env as any), NbsSoapService.getMiddleRate('CHF', danas, c.env as any),
      NbsSoapService.getMiddleRate('EUR', juce, c.env as any), NbsSoapService.getMiddleRate('USD', juce, c.env as any), NbsSoapService.getMiddleRate('CHF', juce, c.env as any)
    ]);
    const calcTrend = (now: number, prev: number) => {
      if (!prev || prev === 0) return { procenat: 0, smer: 'ISTO' };
      const diff = now - prev;
      return { procenat: Math.abs((diff / prev) * 100), smer: diff > 0 ? 'GORE' : diff < 0 ? 'DOLE' : 'ISTO' };
    };
    const eurTrend = calcTrend(eur, eurJuce);
    const data = { status: 'success', izvor: 'Narodna banka Srbije (NBS)', datum: danas, tiker: [{ valuta: 'EUR', kurs: eur, promenaProcenat: eurTrend.procenat, smer: eurTrend.smer }], valute: { EUR: { kod: '978', jedinica: 1, kurs: eur, trend: eurTrend } }, schemaOrg: { '@context': 'https://schema.org', '@type': 'FinancialProduct', 'name': `Zvanični Srednji Kurs NBS na dan ${danas}`, 'offers': { '@type': 'Offer', 'price': eur, 'priceCurrency': 'RSD' } } };
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' } });
  } catch (err) { return new Response(JSON.stringify({ error: 'Trenutno nedostupni podaci' }), { status: 500 }); }
});

// --- SYSTEM ROUTES ---
app.get('/api/health', async () => Response.json({ status: 'ONLINE', system: 'SEF Bridge Backend v5.0.0' }));

app.get('/api/onboarding/search', async ({ req, env }: RouterContext<Env>) => {
  const query = new URL(req.url).searchParams.get('q')?.trim() || '';
  if (query.length < 3) return Response.json({ uspeh: true, rezultati: [] });
  const { results } = await env.REGISTAR_DB.prepare("SELECT pib, naziv_firme FROM sef_kompanije WHERE rowid IN (SELECT rowid FROM sef_kompanije_fts WHERE sef_kompanije_fts MATCH ?) LIMIT 10").bind(`${query}*`).all();
  return Response.json({ uspeh: true, rezultati: results });
});

app.post('/api/auth/login', async ({ req, env }: RouterContext<Env>) => {
  const { pib, password } = await req.json() as any;
  const klijentBaseName = `klijent_${pib}`;
  const klijentDO = env.KLIJENT_BAZA_OBJECT.get(env.KLIJENT_BAZA_OBJECT.idFromName(klijentBaseName));
  if (password) {
    const loginCheckRes = await klijentDO.fetch('http://do/api/internal/verify-password', { method: 'POST', body: JSON.stringify({ password }) });
    if (!loginCheckRes.ok) return Response.json({ error: 'Pogrešna lozinka' }, { status: 401 });
  }
  return Response.json({ success: true, klijentId: klijentBaseName, pib });
});

app.post('/api/register', async ({ req, env }: RouterContext<Env>) => {
  const { pib, naziv, sef_api_key, otpremnice_api_key } = await req.json() as any;
  const klijentBaseName = `klijent_${pib}`;
  const klijentDO = env.KLIJENT_BAZA_OBJECT.get(env.KLIJENT_BAZA_OBJECT.idFromName(klijentBaseName));
  await env.REGISTAR_DB.prepare("INSERT INTO klijenti (klijent_id, naziv) VALUES (?, ?) ON CONFLICT(klijent_id) DO UPDATE SET poslednji_sync = CURRENT_TIMESTAMP").bind(klijentBaseName, naziv || klijentBaseName).run();
  await klijentDO.fetch('http://do/config', { method: 'POST', body: JSON.stringify({ sef_api_key, otpremnice_api_key, klijent_id: klijentBaseName, plan: 'Micro', limit: 50 }) });
  return Response.json({ success: true, klijentId: klijentBaseName, pib });
});

// --- CORE API ROUTES ---
app.get('/api/fakture', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!));
  return await kDO.fetch(`http://do/api/internal/get-fakture?page=${new URL(c.req.url).searchParams.get('page') || '1'}`);
});

app.post('/api/fakture/send', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!));
  return await kDO.fetch('http://do/api/fakture/send', { method: 'POST', body: JSON.stringify(await c.req.json()), headers: { 'Content-Type': 'application/json' } });
});

app.get('/api/webhook-setup', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!));
  return await kDO.fetch('http://do/api/internal/webhook-instructions');
});

app.get('/api/dashboard/stats', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!));
  return Response.json(await kDO.getStats());
});

app.get('/api/dashboard/logs', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!));
  return Response.json(await kDO.getLogs());
});

app.get('/api/audit/retention-policy', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!));
  return await kDO.fetch('http://do/api/audit/retention-policy');
});

app.get('/api/analytics/potrosnja', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!));
  return await kDO.fetch('http://do/api/internal/get-potrosnja');
});

app.post('/api/otpremnice/send', internalOnly, validateJson(DespatchSchema, async (c: any) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId));
  const config = await kDO.fetch('http://do/config').then((r: any) => r.json()) as any;
  const potrosnja = await kDO.fetch('http://do/api/internal/get-potrosnja').then((r: any) => r.json()) as any;
  const plan = config.plan_name || 'Micro';
  const pravila = DOZVOLE_PLAN_OVA[plan as keyof typeof DOZVOLE_PLAN_OVA];
  if (!pravila.eotpremnice) return Response.json({ error: 'PLAN_LIMITATION' }, { status: 403 });
  if (potrosnja.eotpremnice_count >= pravila.limit_eotpremnice) return Response.json({ error: 'LIMIT_EXCEEDED' }, { status: 429 });
  return await kDO.fetch(new Request('http://do/otpremnice/send', { method: 'POST', body: JSON.stringify(c.validJson), headers: { 'Content-Type': 'application/json', 'X-Otpremnice-Key': config.otpremnice_api_key } }));
}));

app.post('/api/otpremnice/reconcile-credit-note/:id', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!));
  return await kDO.fetch(`http://do/api/otpremnice/reconcile-credit-note/${extractParamIdFromUrl(c.req.url)}`, { method: 'POST' });
});

app.post('/api/agency/register', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  return Response.json({ success: true, message: 'Agencija registrovana.' });
});

// --- WEBHOOKS ---
app.post('/api/webhooks/sef-update', async () => Response.json({ success: true }));
app.post('/api/webhooks/otpremnice', async () => Response.json({ success: true }));

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) { return app.fetch(req, env, ctx); },
  async queue(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext) {
    if (batch.queue === "eotpremnice-reconciliation-queue") return await handleLogisticsQueue(batch, env);
    if (batch.queue === "sef-webhook-delivery") {
      for (const msg of batch.messages) {
        const payload = msg.body;
        const config = await env.REGISTAR_DB.prepare("SELECT webhook_url, webhook_secret FROM klijentska_podesavanja WHERE pib = ?").bind(payload.pibKupca).first<{ webhook_url: string; webhook_secret: string }>();
        if (config?.webhook_url) await WebhookRelay.deliver(payload, config.webhook_url, config.webhook_secret);
        msg.ack();
      }
    }
  },
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) { ctx.waitUntil(ComplianceWatcher.checkSefUpdates(env as any)); }
};
