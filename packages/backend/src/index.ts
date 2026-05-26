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
  posaljiHotfixTelegramAlarm, 
  handleLogisticsQueue 
} from '@sef/shared';
import ComplianceWatcher from "./compliance-watcher";

export const app = Router<Env>();

// --- PUBLIC SEO ROUTES ---

app.get('/api/public/v1/kursna-lista/og.png', async (c) => {
  const danas = new Date().toISOString().split('T')[0];
  const juceDate = new Date();
  juceDate.setDate(juceDate.getDate() - 1);
  const juce = juceDate.toISOString().split('T')[0];

  try {
    const [eur, eurJuce] = await Promise.all([
      NbsSoapService.getMiddleRate('EUR', danas, c.env as any),
      NbsSoapService.getMiddleRate('EUR', juce, c.env as any)
    ]);

    const proc = eurJuce !== 0 ? ((eur - eurJuce) / eurJuce) * 100 : 0;
    
    // @ts-ignore
    const fontBuffer = await import('@sef/shared/assets/Inter-Bold.ttf').then(m => m.default);

    const png = await OgEngine.generatePng({
      valuta: 'EUR',
      kurs: eur.toFixed(4),
      promena: Math.abs(proc).toFixed(4),
      raste: eur >= eurJuce
    }, fontBuffer);

    return new Response(png, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'OG_GEN_FAIL', message: err.message }), { status: 500 });
  }
});

app.get('/api/public/v1/kursna-lista', async (c) => {
  const danas = new Date().toISOString().split('T')[0];
  const juceDate = new Date();
  juceDate.setDate(juceDate.getDate() - 1);
  const juce = juceDate.toISOString().split('T')[0];

  try {
    const [eur, usd, chf, eurJuce, usdJuce, chfJuce] = await Promise.all([
      NbsSoapService.getMiddleRate('EUR', danas, c.env as any),
      NbsSoapService.getMiddleRate('USD', danas, c.env as any),
      NbsSoapService.getMiddleRate('CHF', danas, c.env as any),
      NbsSoapService.getMiddleRate('EUR', juce, c.env as any),
      NbsSoapService.getMiddleRate('USD', juce, c.env as any),
      NbsSoapService.getMiddleRate('CHF', juce, c.env as any)
    ]);

    const calcTrend = (now: number, prev: number) => {
      if (!prev || prev === 0) return { procenat: 0, smer: 'ISTO' };
      const diff = now - prev;
      const proc = (diff / prev) * 100;
      return {
        procenat: Math.abs(proc),
        smer: diff > 0 ? 'GORE' : diff < 0 ? 'DOLE' : 'ISTO'
      };
    };

    const eurTrend = calcTrend(eur, eurJuce);
    const usdTrend = calcTrend(usd, usdJuce);
    const chfTrend = calcTrend(chf, chfJuce);

    const data = {
      status: 'success',
      izvor: 'Narodna banka Srbije (NBS)',
      datum: danas,
      tiker: [
        { valuta: 'EUR', kurs: eur, promenaProcenat: eurTrend.procenat, smer: eurTrend.smer },
        { valuta: 'USD', kurs: usd, promenaProcenat: usdTrend.procenat, smer: usdTrend.smer },
        { valuta: 'CHF', kurs: chf, promenaProcenat: chfTrend.procenat, smer: chfTrend.smer }
      ],
      valute: {
        EUR: { kod: '978', jedinica: 1, kurs: eur, trend: eurTrend },
        USD: { kod: '840', jedinica: 1, kurs: usd, trend: usdTrend },
        CHF: { kod: '756', jedinica: 1, kurs: chf, trend: chfTrend }
      },
      schemaOrg: {
        '@context': 'https://schema.org',
        '@type': 'FinancialProduct',
        'name': `Zvanični Srednji Kurs NBS na dan ${danas}`,
        'description': `Trenutni srednji kurs evra (EUR), dolara (USD) i franka (CHF) preuzet sa Narodne banke Srbije.`,
        'offers': {
          '@type': 'Offer',
          'price': eur,
          'priceCurrency': 'RSD'
        }
      }
    };

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Trenutno nedostupni podaci' }), { status: 500 });
  }
});

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

// Pomagač za ekstrakciju URL ID parametara (Otporan na trailing slashes)
const extractParamIdFromUrl = (urlStr: string): string | null => {
  try {
    const match = new URL(urlStr).pathname.match(/\/([^\/]+)\/?$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
};

// 🛡️ TITANIJUMSKI SECURITY MIDDLEWARE
const internalOnly = (c: RouterContext<Env> & { klijentId?: string, operater?: string }) => {
  const klijentId = c.req.headers.get('X-Klijent-ID');
  console.log('[Auth] Incoming X-Klijent-ID:', klijentId);
  const operater = c.req.headers.get('X-Operater') || 'Sistemski Operater';
  
  if (!klijentId || klijentId.trim() === '') {
    console.error('[Auth] Forbidden access: missing X-Klijent-ID');
    return new Response(JSON.stringify({ 
      error: 'FORBIDDEN_BACKEND_ACCESS', 
      message: 'Zabranjen direktan pristup. Komunikacija dozvoljena isključivo kroz unutrašnji Service Binding.' 
    }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  c.klijentId = klijentId;
  c.operater = operater;
};

// --- SYSTEM ROUTES ---
app.get('/api/health', async () => {
  return Response.json({ status: 'ONLINE', system: 'SEF Bridge Backend v5.0.0' });
});

// FTS5 Onboarding Search
app.get('/api/onboarding/search', async ({ req, env }: RouterContext<Env>) => {
  const url = new URL(req.url);
  const query = url.searchParams.get('q')?.trim() || '';
  if (query.length < 3) return Response.json({ uspeh: true, rezultati: [] });

  try {
    const { results } = await env.REGISTAR_DB.prepare(`
      SELECT pib, naziv_firme FROM sef_kompanije 
      WHERE rowid IN (SELECT rowid FROM sef_kompanije_fts WHERE sef_kompanije_fts MATCH ?) LIMIT 10
    `).bind(`${query}*`).all();
    return Response.json({ uspeh: true, rezultati: results });
  } catch (e: any) {
    return Response.json({ uspeh: false, greska: e.message }, { status: 500 });
  }
});
// 🟢 LOGIN
app.post('/api/auth/login', async ({ req, env }: RouterContext<Env>) => {
  try {
    const body = await req.json() as any;
    const { pib, password } = body;

    if (!pib) return Response.json({ error: 'PIB je obavezan' }, { status: 400 });

    const klijentBaseName = `klijent_${pib}`;
    const klijentDO = env.KLIJENT_BAZA_OBJECT.get(env.KLIJENT_BAZA_OBJECT.idFromName(klijentBaseName));

    if (password) {
      const loginCheckRes = await klijentDO.fetch('http://do/api/internal/verify-password', {
        method: 'POST',
        body: JSON.stringify({ password })
      });
      if (!loginCheckRes.ok) return Response.json({ error: 'Pogrešna lozinka' }, { status: 401 });
      return Response.json({ success: true, klijentId: klijentBaseName, pib, operater: body.operater || 'Operater' });
    }

    // Fallback if no password is provided - check if client exists
    const klijent = await env.REGISTAR_DB.prepare("SELECT pib FROM sef_kompanije WHERE pib = ?").bind(pib).first();
    if (!klijent) return Response.json({ error: 'PIB nije u državnom registru' }, { status: 403 });

    return Response.json({ success: true, klijentId: klijentBaseName, pib, operater: body.operater || 'Operater' });
  } catch (e: any) {
    console.error('[Login Error]', e);
    return Response.json({ error: 'AUTH_SERVER_ERROR', message: e.message }, { status: 500 });
  }
});

// 🟢 REGISTRACIJA
app.post('/api/register', async ({ req, env }: RouterContext<Env>) => {
  try {
    const body = await req.json() as { pib: string, naziv: string, sef_api_key: string, otpremnice_api_key: string };
    const { pib, naziv, sef_api_key, otpremnice_api_key } = body;
    
    if (!pib || !sef_api_key || !otpremnice_api_key) {
      return Response.json({ error: 'PIB, SEF API Key i Otpremnice API Key su obavezni.' }, { status: 400 });
    }

    const proveraKompanije = await env.REGISTAR_DB.prepare("SELECT pib FROM sef_kompanije WHERE pib = ?").bind(pib).first();
    if (!proveraKompanije) {
      return Response.json({ error: 'ONBOARDING_REJECTED', message: 'PIB nije nađen u registru.' }, { status: 422 });
    }

    const klijentBaseName = `klijent_${pib}`;
    const klijentDO = env.KLIJENT_BAZA_OBJECT.get(env.KLIJENT_BAZA_OBJECT.idFromName(klijentBaseName));

    await env.REGISTAR_DB.prepare(`
      INSERT INTO klijenti (klijent_id, naziv, ima_aktivne_fakture, poslednji_sync) VALUES (?, ?, 0, CURRENT_TIMESTAMP)
      ON CONFLICT(klijent_id) DO UPDATE SET poslednji_sync = CURRENT_TIMESTAMP
    `).bind(klijentBaseName, naziv || klijentBaseName).run();

    await klijentDO.fetch(new Request('http://do/config', {
      method: 'POST',
      body: JSON.stringify({ sef_api_key, otpremnice_api_key, klijent_id: klijentBaseName, plan: 'Micro', limit: 50 })
    }));

    return Response.json({ success: true, klijentId: klijentBaseName, pib });
  } catch (e: any) {
    console.error('[Registration Error]', e);
    return Response.json({ error: 'REGISTRATION_SERVER_ERROR', message: e.message }, { status: 500 });
  }
});

app.post('/api/admin/renew-subscription', async ({ req, env }: RouterContext<Env>) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${env.ADMIN_API_KEY}`) {
    return Response.json({ error: 'Unauthorized admin access' }, { status: 401 });
  }

  const body = await req.json() as any;
  if (!body.pib) return Response.json({ error: 'PIB is required' }, { status: 400 });

  const klijentBaseName = `klijent_${body.pib}`;
  const doStub = env.KLIJENT_BAZA_OBJECT.get(env.KLIJENT_BAZA_OBJECT.idFromName(klijentBaseName));

  const danasnjiDatum = new Date().toISOString().split('T')[0]!;
  const godinaDanaUnapredMs = Date.now() + (365 * 24 * 60 * 60 * 1000);

  await doStub.fetch('http://durableobject/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status_pretplate: 'AKTIVAN',
      plan: body.paket_id || 'Plus',
      billing_period: 'annual',
      limit_faktura_godisnje: body.limit_faktura_godisnje || '6000',
      licenca_od_datuma: danasnjiDatum,
      licenca_istice_timestamp: String(godinaDanaUnapredMs),
      avans_za_obnovu_poslat: 0
    })
  });

  await doStub.fetch('http://durableobject/sync-sef', { method: 'POST' });
  return Response.json({ success: true, message: `Subscription renewed for ${body.pib}` });
});

app.post('/api/fakture/sync', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!));
  const result = await kDO.syncWithSef();
  return Response.json({ success: true, result });
});

app.get('/api/fakture', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!));
  const url = new URL(c.req.url);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  return await kDO.fetch(`http://do/api/internal/get-fakture?page=${page}`);
});

app.get('/api/webhook-setup', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!));
  return await kDO.fetch('http://do/api/internal/webhook-instructions');
});

// --- CORE API ROUTES ---

app.get('/api/dashboard/stats', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!));
  return Response.json(await kDO.getStats());
});

app.get('/api/dashboard/logs', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!));
  return Response.json(await kDO.getLogs());
});

app.get('/api/dokumenti/izlazni', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const url = new URL(c.req.url);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = parseInt(url.searchParams.get('limit') || '10', 10);
  const offset = (page - 1) * limit;
  const cistiPib = c.klijentId!.replace('klijent_', '');

  // 1. Paginirani podaci
  const query = "SELECT * FROM sef_fakture WHERE klijent_pib = ? ORDER BY datum_slanja DESC LIMIT ? OFFSET ?";
  const { results: fakture } = await c.env.REGISTAR_DB.prepare(query).bind(cistiPib, limit, offset).all();

  // 2. KPI Statistika
  const kpi = await c.env.REGISTAR_DB.prepare(`
    SELECT 
      COUNT(*) as ukupno_komada,
      SUM(CASE WHEN status IN ('Sent', 'Poslato') THEN iznos_sa_pdv ELSE 0 END) as saldo_poslato,
      SUM(CASE WHEN status IN ('Approved', 'CONFIRMED') THEN iznos_sa_pdv ELSE 0 END) as saldo_odobreno
    FROM sef_fakture
    WHERE klijent_pib = ?
  `).bind(cistiPib).first<{ ukupno_komada: number; saldo_poslato: number; saldo_odobreno: number }>();

  // 3. Ukupan broj za paginaciju
  const countRes = await c.env.REGISTAR_DB.prepare("SELECT COUNT(*) as c FROM sef_fakture WHERE klijent_pib = ?").bind(cistiPib).first<{ c: number }>();
  const totalCount = countRes?.c || 0;

  return Response.json({
    success: true,
    data: fakture,
    stats: {
      ukupno_dokumenata: kpi?.ukupno_komada || 0,
      potrazivanja_u_najavi: kpi?.saldo_poslato || 0,
      realizovan_prihod: kpi?.saldo_odobreno || 0
    },
    meta: {
      total_items: totalCount,
      total_pages: Math.ceil(totalCount / limit),
      current_page: page,
      has_next: offset + limit < totalCount,
      has_prev: page > 1
    }
  });
});

app.get('/api/debug/dump', internalOnly, async (c: RouterContext<Env>) => {
  const { results } = await c.env.REGISTAR_DB.prepare("SELECT * FROM dokumenti LIMIT 5").all();
  return Response.json({ results });
});

app.get('/api/logistika/documents', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const url = new URL(c.req.url);
  const type = url.searchParams.get('type') || 'OTPREMNICA';
  const status = url.searchParams.get('status');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = 20;
  const offset = (page - 1) * limit;

  let query = `SELECT * FROM dokumenti WHERE tip = ?`;
  const params: any[] = [type];

  if (status) { query += ` AND status = ?`; params.push(status); }
  
  const cistiPib = c.klijentId!.replace('klijent_', '');
  query += ` AND (pib_prodavca = ? OR pib_kupca = ?)`;
  params.push(cistiPib, cistiPib);

  query += ` ORDER BY kreirano_u DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const { results } = await c.env.REGISTAR_DB.prepare(query).bind(...params).all();
  return Response.json(results.map((doc: any) => ({
    id: doc.id, sefId: doc.sef_id, tip: doc.tip, broj: doc.broj,
    pibProdavca: doc.pib_prodavca, pibKupca: doc.pib_kupca, status: doc.status,
    issueDate: doc.kreirano_u ? doc.kreirano_u.split(' ')[0] : '', amount: doc.iznos_osnovica,
    parentId: doc.parent_id, xmlBlob: doc.xml_blob, kreirano_u: doc.kreirano_u
  })));
});

app.get('/api/dokumenti/chain/:id', internalOnly, async (c: RouterContext<Env>) => {
  const id = extractParamIdFromUrl(c.req.url);
  if (!id) return new Response('Missing ID', { status: 400 });

  const bridge = new D1SyncBridge(c.env.REGISTAR_DB);
  const chain = await bridge.getDocumentChain(id);
  return Response.json({
    success: true,
    chain: chain.results.map((doc: any) => ({
      id: doc.id, sefId: doc.sef_id, tip: doc.tip, broj: doc.broj,
      pibProdavca: doc.pib_prodavca, pibKupca: doc.pib_kupca, status: doc.status,
      issueDate: doc.kreirano_u ? doc.kreirano_u.split(' ')[0] : '', parentId: doc.parent_id,
      xmlBlob: doc.xml_blob, kreirano_u: doc.kreirano_u
    }))
  });
});

app.get('/api/otpremnice/reconciliation/:id', internalOnly, async (c: RouterContext<Env>) => {
  const otpremnicaId = extractParamIdFromUrl(c.req.url);
  if (!otpremnicaId) return new Response('Missing ID', { status: 400 });

  const bridge = new D1SyncBridge(c.env.REGISTAR_DB);
  const documentChain = await bridge.getDocumentChain(otpremnicaId);
  if (documentChain.results.length === 0) return Response.json({ error: 'Logistički lanac nije pronađen' }, { status: 404 });

  const reconciliationData = await bridge.analyzeReconciliation(otpremnicaId);
  const results = reconciliationData.results as any[];

  const imaKvantitativniManjak = results.some(r => r.kvantitativni_manjak > 0);
  const imaAkciznuDevijaciju = results.some(r => Math.abs(r.devijacija_gustine) > 0.0001);

  let statusZastite = 'SECURE 🟢';
  if (imaKvantitativniManjak) statusZastite = 'QUANTITY_DISCREPANCY 🟡';
  if (imaAkciznuDevijaciju) statusZastite = 'EXCISE_BREACH 🔴';

  return Response.json({
    success: true,
    meta: { otpremnicaId, statusZastite, verifikovanoAt: new Date().toISOString() },
    chain: documentChain.results.map((doc: any) => ({ id: doc.id, tip: doc.tip, status: doc.status, kreirano_u: doc.kreirano_u })),
    stavke: results
  });
});

import { DOZVOLE_PLAN_OVA } from '@sef/shared/types/sef';

// ... (Rest of imports)

app.post('/api/otpremnice/send', internalOnly, validateJson(DespatchSchema, async (c: any) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId));
  const input = c.validJson!;
  
  const config = await kDO.fetch('http://do/config').then(r => r.json()) as any;
  const potrosnja = await kDO.fetch('http://do/api/internal/get-potrosnja').then(r => r.json()) as any;
  const plan = config.plan_name || 'Micro';
  const pravila = DOZVOLE_PLAN_OVA[plan as keyof typeof DOZVOLE_PLAN_OVA];

  if (!pravila.eotpremnice) {
    return Response.json({ error: 'PLAN_LIMITATION', message: 'Vaš trenutni paket ne podržava modul za eOtpremnice.' }, { status: 403 });
  }

  if (potrosnja.eotpremnice_count >= pravila.limit_eotpremnice) {
    return Response.json({ error: 'LOGISTICS_LIMIT_EXCEEDED', message: `Iskoristili ste maksimalni mesečni limit od ${pravila.limit_eotpremnice} eOtpremnica za ovaj mesec.` }, { status: 429 });
  }

  if (!config.otpremnice_api_key || config.otpremnice_api_key.trim() === '') {
    return Response.json({ error: 'MISSING_OTPREMNICE_KEY', message: 'API ključ nije unet.' }, { status: 422 });
  }

  const checkRes = await kDO.fetch(new Request('http://do/api/internal/check-quota'));
  if (!checkRes.ok) return checkRes;

  const ublPayload = {
    ID: input.id, IssueDate: input.issueDate, DespatchDate: input.despatchDate,
    Supplier: { Pib: input.supplierPib, Name: 'PRODAVAC' }, Customer: { Pib: input.customerPib, Name: 'KUPAC' },
    Lines: input.lines.map((l: any) => ({
      ID: l.id, ItemName: l.name, DeliveredQuantity: l.quantity, UnitCode: l.unitCode,
      exciseCategory: l.exciseCategory, itemProperties: l.itemProperties
    })),
    BillingReference: input.billingReference
  };

  const doResponse = await kDO.fetch(new Request('http://do/otpremnice/send', { 
    method: 'POST', body: JSON.stringify(ublPayload), headers: { 'Content-Type': 'application/json', 'X-Otpremnice-Key': config.otpremnice_api_key }
  }));

  // ... (Remainder of route)

  if (doResponse.ok) {
    const result = await doResponse.clone().json() as any;
    if (result.error === 'MFIN_PROCESSING_TIMEOUT') {
      await c.env.OTPREMNICA_QUEUE.send({ documentNumber: input.id, pib: c.klijentId.replace('klijent_', ''), tip: 'OTPREMNICA', pokusaj: 1 });
    }
    if (result.success && result.xml) {
      c.ctx.waitUntil((async () => {
        try {
          await c.env.SEF_QUEUE.send({ id: result.internalId || input.id, xml: result.xml, pib: c.klijentId.replace('klijent_', ''), tip: 'OTPREMNICA' });
        } catch {}
      })());
    }
  }
  return doResponse;
}));

app.post('/api/prijemnice/receive', internalOnly, validateJson(ReceiptSchema, async (c: any) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId));
  const input = c.validJson!;

  const ublPayload = {
    id: input.id, issueDate: input.issueDate,
    supplier: { pib: input.supplierPib }, buyer: { pib: input.customerPib },
    despatchDocumentReference: input.despatchReference ? { id: input.despatchReference.id, issueDate: input.despatchReference.issueDate } : undefined,
    lines: input.lines.map((l: any) => ({
      id: l.id, receivedQuantity: l.receivedQuantity, unitCode: l.unitCode, shortQuantity: l.shortQuantity,
      rejectedQuantity: l.rejectedQuantity, rejectReason: l.rejectReason, itemName: l.itemName,
      despatchLineReference: l.despatchLineId ? { id: l.despatchLineId } : undefined,
      exciseCategory: l.exciseCategory, itemProperties: l.itemProperties
    })),
    note: input.note
  };

  const doResponse = await kDO.fetch(new Request('http://do/prijemnice/receive', { 
    method: 'POST', body: JSON.stringify(ublPayload), headers: { 'Content-Type': 'application/json' }
  }));

  if (doResponse.ok) {
    const result = await doResponse.clone().json() as any;
    if (result.error === 'MFIN_PROCESSING_TIMEOUT') {
      await c.env.OTPREMNICA_QUEUE.send({ documentNumber: input.id, pib: c.klijentId.replace('klijent_', ''), tip: 'PRIJEMNICA', pokusaj: 1 });
    }
    if (result.success && result.xml) {
      c.ctx.waitUntil((async () => {
        try {
          await c.env.SEF_QUEUE.send({ id: result.internalId || input.id, xml: result.xml, pib: c.klijentId.replace('klijent_', ''), tip: 'PRIJEMNICA' });
        } catch {}
      })());
    }
  }
  return doResponse;
}));

// --- FINANSIJSKI ŠTIT (381 KOREKCIJA) ---
app.post('/api/otpremnice/reconcile-credit-note/:id', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const otpremnicaId = extractParamIdFromUrl(c.req.url);
  if (!otpremnicaId) return new Response('Missing ID', { status: 400 });

  const bridge = new D1SyncBridge(c.env.REGISTAR_DB);
  const analysis = await bridge.analyzeReconciliation(otpremnicaId);
  const discrepancies = (analysis.results as any[]).filter(r => r.kvantitativni_manjak > 0 || Math.abs(r.devijacija_gustine) > 0.0001);
  
  if (discrepancies.length === 0) return Response.json({ success: false, message: 'Nema logističkih anomalija za ovaj lanac.' });

  const faktura = await c.env.REGISTAR_DB.prepare("SELECT id, sef_id, broj, pib_prodavca, pib_kupca, kreirano_u FROM dokumenti WHERE parent_id = ? AND tip = '380'").bind(otpremnicaId).first() as any;
  if (!faktura) return Response.json({ error: 'Originalna prateća eFaktura (380) nije pronađena.' }, { status: 404 });

  const creditNoteId = `CN-${Date.now()}`;
  const xmlPayload = SefUblBuilder.buildCreditNote({
    broj: `ODOBRENJE-${faktura.broj}`, pibProdavca: faktura.pib_prodavca, pibKupca: faktura.pib_kupca,
    originalnaFakturaBroj: faktura.broj, originalnaFakturaSefId: faktura.sef_id, originalniDatum: faktura.kreirano_u.split(' ')[0],
    stavke: discrepancies.map((d, i) => ({
      id: (i + 1).toString(), naziv: d.artikal_naziv, manjakKolicina: d.kvantitativni_manjak,
      jedinicaMere: d.jedinica_mere || 'H87', cena: d.cena || 100, porezStopa: 20, porezKategorija: 'S'
    }))
  });

  await bridge.upsertDocument({
    id: creditNoteId, tip: '381', broj: `ODOBRENJE-${faktura.broj}`, pibProdavca: faktura.pib_prodavca, pibKupca: faktura.pib_kupca,
    status: 'SENT', parentId: faktura.id, xmlBlob: xmlPayload
  });

  return Response.json({ success: true, brojDokumenta: `ODOBRENJE-${faktura.broj}` });
});

app.get('/api/analytics/pppdv-export', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!));
  const url = new URL(c.req.url);
  const period = url.searchParams.get('period');
  return await kDO.fetch(`http://do/api/analytics/pppdv-export?period=${period}`);
});

app.post('/api/dashboard/config', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!));
  const body = await c.req.json();
  return await kDO.fetch('http://do/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
});

// --- WEBHOOKS & BACKGROUND WORKERS ---
app.post('/api/webhooks/sef/:webhookToken', async (c: RouterContext<Env>) => {
  const webhookToken = c.req.param('webhookToken');
  const klijent = await c.env.REGISTAR_DB.prepare(
    "SELECT pib, naziv, plan FROM sef_kompanije WHERE webhook_token = ?"
  ).bind(webhookToken).first<{ pib: string; naziv: string; plan: string }>();

  if (!klijent) {
    console.error(`🚨 Webhook pokušaj sa nevalidnim tokenom: ${webhookToken}`);
    return Response.json({ error: 'UNAUTHORIZED_WEBHOOK_TOKEN' }, { status: 401 });
  }

  try {
    const body = await c.req.json() as { payload?: Array<{ invoice?: any }> };
    if (!body.payload || body.payload.length === 0) {
      return Response.json({ success: true, message: 'Prazan payload ignorisan.' });
    }

    for (const stavka of body.payload) {
      const invoice = stavka.invoice;
      if (!invoice || !invoice.header) continue;

      const header = invoice.header;
      const statusObj = invoice.status;
      const idFakture = header.internalInvoiceId;
      const brojFakture = header.clientInvoiceNumber;
      const status = statusObj?.newInvoiceStatus || 'Unknown';
      const trenutniDatum = new Date().toISOString();

      await c.env.REGISTAR_DB.prepare(`
        INSERT INTO sef_fakture (id, klijent_pib, broj_fakture, kupac_naziv, kupac_pib, iznos_sa_pdv, status, datum_slanja)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET status = excluded.status, datum_slanja = excluded.datum_slanja
      `).bind(
        idFakture, klijent.pib, brojFakture || 'Nepoznat broj', invoice.receiverName || 'Učitavanje...',
        invoice.receiverPib || '000000000', invoice.sumWithVat || 0, status, trenutniDatum
      ).run();

      if ((status === 'CONFIRMED' || status === 'Approved') && klijent.plan !== 'Micro') {
        if (c.env.OTPREMNICA_QUEUE) {
          await c.env.OTPREMNICA_QUEUE.send({
            tip: 'RECONCILIATION_CHECK',
            klijentPib: klijent.pib,
            invoiceId: idFakture,
            brojFakture: brojFakture
          });
        }
      }
    }
    return Response.json({ success: true, message: `D1 sinhronizovan za PIB ${klijent.pib}.` });
  } catch (error: any) {
    console.error(`💥 Greška Webhook-a za PIB ${klijent.pib}:`, error.message);
    return Response.json({ success: false, error: error.message }, { status: 202 });
  }
});


// --- ENGINE HANDLERS (FETCH, QUEUE, SCHEDULED) ---
export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(req, env, ctx);
  },

  async queue(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext): Promise<void> {
    if (batch.queue === "eotpremnice-reconciliation-queue") {
      return await handleLogisticsQueue(batch, env);
    }

    for (const msg of batch.messages) {
      try {
        const { id, xml, pib } = msg.body;
        const now = new Date();
        const r2Key = `tenants/${pib}/${now.getFullYear()}/${(now.getMonth() + 1)}/${id}.xml`;
        await env.SEF_UBL_ARHIVA.put(r2Key, xml);
        msg.ack();
      } catch {
        msg.retry();
      }
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      try {
        await ComplianceWatcher.checkSefUpdates(env as any);
      } catch {}
    })());
  }
};