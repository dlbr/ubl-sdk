import { Router, type RouterContext } from './router';
import { validateJson } from './validator';
import { 
  DespatchSchema, 
  ReceiptSchema, 
  D1SyncBridge, 
  SefUblBuilder, 
  posaljiHotfixTelegramAlarm, 
  handleLogisticsQueue 
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
  AI: any;
}
export { KlijentBaza } from './KlijentBazaObject';

export const app = Router<Env>();

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
  const operater = c.req.headers.get('X-Operater') || 'Sistemski Operater';
  
  if (!klijentId || klijentId.trim() === '') {
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

// 🟢 LOGIN & REGISTRACIJA
app.post('/api/auth/login', async ({ req, env }: RouterContext<Env>) => {
  try {
    const body = await req.json() as any;
    const { pib, password, api_key } = body;

    if (!pib) return Response.json({ error: 'PIB je obavezan' }, { status: 400 });

    const klijentBaseName = `klijent_${pib}`;
    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentBaseName);
    const doStub = env.KLIJENT_BAZA_OBJECT.get(doId);

    if (password) {
      const loginCheckRes = await doStub.fetch('http://do/api/internal/verify-password', {
        method: 'POST',
        body: JSON.stringify({ password })
      });
      if (!loginCheckRes.ok) return Response.json({ error: 'Pogrešna lozinka' }, { status: 401 });
      return Response.json({ success: true, klijentId: klijentBaseName, pib, operater: body.operater || 'Operater' });
    }

    if (api_key) {
      const klijent = await env.REGISTAR_DB.prepare("SELECT pib FROM sef_kompanije WHERE pib = ?").bind(pib).first();
      if (!klijent) return Response.json({ error: 'PIB nije u državnom registru' }, { status: 403 });

      await env.REGISTAR_DB.prepare(`
        INSERT INTO klijenti (klijent_id, naziv, ima_aktivne_fakture, poslednji_sync) VALUES (?, ?, 0, CURRENT_TIMESTAMP)
        ON CONFLICT(klijent_id) DO UPDATE SET poslednji_sync = CURRENT_TIMESTAMP
      `).bind(klijentBaseName, body.naziv || klijentBaseName).run();

      await doStub.fetch('http://do/config', {
        method: 'POST',
        body: JSON.stringify({ sef_api_key: api_key, klijent_id: klijentBaseName, plan: 'Micro', limit: 50 })
      });

      return Response.json({ success: true, klijentId: klijentBaseName, pib, operater: body.operater || 'Operater' });
    }

    return Response.json({ error: 'Nedostaju kredencijali' }, { status: 400 });
  } catch (e: any) {
    return Response.json({ error: 'AUTH_SERVER_ERROR', message: e.message }, { status: 500 });
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

// --- CORE API ROUTES ---

app.get('/api/dashboard/stats', internalOnly, async (c: RouterContext<Env> & { klijentId?: string }) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId!));
  return Response.json(await kDO.getStats());
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

app.post('/api/otpremnice/send', internalOnly, validateJson(DespatchSchema, async (c: any) => {
  const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(c.klijentId));
  const input = c.validJson!;
  
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
    method: 'POST', body: JSON.stringify(ublPayload), headers: { 'Content-Type': 'application/json' }
  }));

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
app.post('/api/webhooks/otpremnice', async (c: RouterContext<Env>) => {
  const { id, status, pib_kompanije } = await c.req.json() as any;
  const bridge = new D1SyncBridge(c.env.REGISTAR_DB);

  await c.env.REGISTAR_DB.prepare("UPDATE dokumenti SET status = ?, azurirano_u = CURRENT_TIMESTAMP WHERE id = ? OR sef_id = ?").bind(status, id, id).run();
  
  if (pib_kompanije) {
    const kDO = c.env.KLIJENT_BAZA_OBJECT.get(c.env.KLIJENT_BAZA_OBJECT.idFromName(`klijent_${pib_kompanije}`));
    c.ctx.waitUntil((async () => {
      await kDO.fetch(new Request('http://do/webhooks/despatch-update', { method: 'POST', body: JSON.stringify({ despatch_id: id, novi_status: status }) }));

      if (status === 'ACCEPTED' || status === 'CONFIRMED' || status === 'DISCREPANCY') {
        const analysis = await bridge.analyzeReconciliation(id);
        for (const row of (analysis.results as any[])) {
          if (row.devijacija_gustine !== 0 || row.kvantitativni_manjak !== 0) {
            await posaljiHotfixTelegramAlarm(
              `🚨 **LOGISTIČKA ANOMALIJA** 🚨\nArtikal: ${row.artikal_naziv}\nManjak: ${row.kvantitativni_manjak}\nDevijacija Gustine: ${row.devijacija_gustine}\nStatus: ${status}`,
              id, c.env as any
            );
          }
        }
      }
    })());
  }
  return Response.json({ success: true });
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