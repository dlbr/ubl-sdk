import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";
import { SefXmlBuilder, type SefInvoiceData, SefInvoiceSchema } from "../shared/types/sef";
import { SefClient } from "../shared/services/sefClient";
import { PopdvSefClient } from "../shared/services/popdvClient";
import { SefExcelBuilder } from "../shared/services/excelBuilder";
import * as v from 'valibot';
import { SefUblParser } from "./ublParser";
import { type PopdvSubmitData, PopdvCorrectionSchema } from '../shared/types/popdv';
import { Router, type RouterContext } from './router';
import { AuthEngine } from '../shared/services/auth';

export interface PppdvSummary {
  period: string;
  pozicija001_osnovica20: number;
  pozicija101_pdv20: number;
  pozicija002_osnovica10: number;
  pozicija102_pdv10: number;
  pozicija003_oslobodjenSaPravom: number;
  pozicija008_prethodniPorezOdbitni: number;
  porezZaUplatuIliPovracaj: number; 
}

// LORBEROV MAKRO: Prepuštanje kontrole Event Loop-u radi sprečavanja CPU izgladnjivanja
const yieldToEventLoop = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * KlijentBaza - Isolated SQLite storage and state machine for a single tenant.
 * Handles async sending, status synchronization, and purchase ingestion.
 */
export class KlijentBaza extends DurableObject<Env> {
  private sql: SqlStorage;
  private isDraining = false;
  private isSyncingPurchases = false;
  private currentBatchStart = 0;
  private readonly MAX_BATCH_DURATION_MS = 15000;
  private app = Router<Env>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.initDatabase();
    this.setupRoutes();
  }

  override async fetch(request: Request): Promise<Response> {
    return this.app.fetch(request, this.env, this.ctx as any);
  }

  private setupRoutes() {
    // 1. POPDV Submissions & Handshake
    this.app.post('/analytics/popdv/submit', async ({ req }: RouterContext<Env>) => {
      const { period, pib } = await req.json() as { period: string, pib: string };
      if (!period || !pib) return Response.json({ error: "Missing period or pib" }, { status: 400 });

      try {
        this.ctx.storage.transactionSync(() => {
          const existingLock = this.sql.exec(`SELECT status FROM sef_popdv_periods WHERE period = ?`, period).toArray() as Array<{ status: string }>;
          if (existingLock.length > 0 && existingLock[0]!.status !== 'REJECTED') {
            throw new Error(`Period ${period} je već u statusu: ${existingLock[0]!.status}.`);
          }

          const popdvData = this.generatePopdvData(period, pib);
          const payloadSnapshot = JSON.stringify(popdvData);

          this.sql.exec(`
            INSERT INTO sef_popdv_submissions (period, status, payload_snapshot)
            VALUES (?, 'SUBMITTING', ?)
            ON CONFLICT(period) DO UPDATE SET 
              status = 'SUBMITTING', 
              payload_snapshot = excluded.payload_snapshot, 
              updated_at = CURRENT_TIMESTAMP
          `, period, payloadSnapshot);
        });
        
        return Response.json({ success: true, message: `Period ${period} zaključan i spreman za slanje.`, status: 'SUBMITTING' }, { status: 202 });
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 409 });
      }
    });

    this.app.post('/api/popdv/submit-draft', async ({ req }: RouterContext<Env>) => {
      const url = new URL(req.url);
      const period = url.searchParams.get('period');
      const pib = url.searchParams.get('pib');

      if (!period || !pib) return Response.json({ error: "Missing period or pib" }, { status: 400 });

      const periodState = this.sql.exec(`SELECT status FROM sef_popdv_periods WHERE period = ?`, period).toArray();
      const trenutniStatus = periodState[0]?.status || 'NOT_SUBMITTED';

      if (trenutniStatus === 'SUBMITTING_DRAFT' || trenutniStatus === 'FINALIZED') {
        return Response.json({ error: "Akcija zabranjena", message: `Period ${period} je u statusu ${trenutniStatus}.` }, { status: 409 });
      }

      this.sql.exec(`INSERT OR REPLACE INTO sef_popdv_periods (period, status) VALUES (?, 'SUBMITTING_DRAFT')`, period);

      try {
        const popdvPayload = this.generatePopdvData(period, pib);
        const configRez = this.sql.exec(`SELECT sef_api_key, environment, sef_subscription_token FROM konfiguracija WHERE id = 1`).toArray() as any[];
        const token = configRez[0]?.sef_subscription_token as string;

        if (!token) {
          this.sql.exec(`UPDATE sef_popdv_periods SET status = 'NOT_SUBMITTED' WHERE period = ?`, period);
          return Response.json({ error: "Autentifikacija neuspešna", message: "Nedostaje državni e-Porezi token." }, { status: 401 });
        }

        const popdvClient = new PopdvSefClient({ baseUrl: 'https://demoppppdv.mfin.gov.rs/public-api', token });
        const result = await popdvClient.sendDraft(popdvPayload);

        if (result.success && result.data?.status === 'VALID') {
          this.sql.exec(`UPDATE sef_popdv_periods SET status = 'DRAFT_ACCEPTED', draft_id = ?, azurirano_at = CURRENT_TIMESTAMP WHERE period = ?`, result.data.draftId, period);
          return Response.json({ success: true, status: 'DRAFT_ACCEPTED', draftId: result.data.draftId });
        } else {
          this.sql.exec(`UPDATE sef_popdv_periods SET status = 'NOT_SUBMITTED' WHERE period = ?`, period);
          return Response.json({ error: "Državna validacija neuspešna", message: result.error || "Greške u strukturi.", details: result.data?.issues || [] }, { status: 422 });
        }
      } catch (err: any) {
        this.sql.exec(`UPDATE sef_popdv_periods SET status = 'NOT_SUBMITTED' WHERE period = ?`, period);
        return Response.json({ error: "Fatalni mrežni promašaj: " + err.message }, { status: 500 });
      }
    });

    this.app.post('/api/popdv/finalize', async ({ req }: RouterContext<Env>) => {
      const url = new URL(req.url);
      const period = url.searchParams.get('period');
      if (!period) return Response.json({ error: "Missing period" }, { status: 400 });

      const periodState = this.sql.exec(`SELECT status, draft_id FROM sef_popdv_periods WHERE period = ?`, period).toArray() as Array<{ status: string; draft_id: string | null }>;
      if (periodState.length === 0) return Response.json({ error: "Period ne postoji" }, { status: 404 });

      const { status: trenutniStatus, draft_id: draftId } = periodState[0] as { status: string; draft_id: string | null };
      if (trenutniStatus !== 'DRAFT_ACCEPTED' || !draftId) return Response.json({ error: "Nevažeće stanje" }, { status: 409 });

      try {
        const configRez = this.sql.exec(`SELECT sef_subscription_token FROM konfiguracija WHERE id = 1`).toArray() as any[];
        const token = configRez[0]?.sef_subscription_token as string;
        if (!token) return Response.json({ error: "Autentifikacija neuspešna" }, { status: 401 });

        const popdvClient = new PopdvSefClient({ baseUrl: 'https://demoppppdv.mfin.gov.rs/public-api', token });
        const result = await popdvClient.finalizeSubmission(draftId);

        if (result.success && result.data?.pppdvBroj) {
          this.sql.exec(`UPDATE sef_popdv_periods SET status = 'FINALIZED', broj_prijave = ?, azurirano_at = CURRENT_TIMESTAMP WHERE period = ?`, result.data.pppdvBroj, period);
          return Response.json({ success: true, status: 'FINALIZED', broj_prijave: result.data.pppdvBroj, datum_prijema: result.data.datumPrijema });
        } else {
          return Response.json({ error: "Državni API odbio finalizaciju", message: result.error }, { status: 422 });
        }
      } catch (err: any) {
        return Response.json({ error: "Fatalna greška: " + err.message }, { status: 500 });
      }
    });

    // 2. Analytics & Exports
    this.app.get('/api/analytics/pppdv-summary', async ({ req }: RouterContext<Env>) => {
      const url = new URL(req.url);
      const period = url.searchParams.get('period');
      if (!period || !/^\d{4}-\d{2}$/.test(period)) return Response.json({ error: "Nevalidan period" }, { status: 400 });
      return Response.json({ success: true, data: this.getPppdvSummary(period) });
    });

    this.app.get('/api/analytics/export-excel', async ({ req }: RouterContext<Env>) => {
      const url = new URL(req.url);
      const period = url.searchParams.get('period');
      if (!period || !/^\d{4}-\d{2}$/.test(period)) return Response.json({ error: "Nevalidan period" }, { status: 400 });

      const summary = this.getPppdvSummary(period);
      
      // RELACIONI OKLOP: Izbacujemo json_extract radi zaštite performansi na masovnom prometu
      const salesRows = this.sql.exec(`
        SELECT f.broj_fakture, f.azurirano_u as datum_racuna,
               COALESCE(MAX(i.item_name), 'Ekstrakcija Prometa') as naziv_kupca,
               '000000000' as pib_kupca,
               SUM(CASE WHEN t.tax_percentage = 20.0 THEN t.taxable_amount ELSE 0 END) as osnovica20,
               SUM(CASE WHEN t.tax_percentage = 20.0 THEN t.tax_amount ELSE 0 END) as pdv20,
               SUM(CASE WHEN t.tax_percentage = 10.0 THEN t.taxable_amount ELSE 0 END) as osnovica10,
               SUM(CASE WHEN t.tax_percentage = 10.0 THEN t.tax_amount ELSE 0 END) as pdv10
        FROM sef_sales_invoice_taxes t
        JOIN fakture f ON t.invoice_id = f.internal_id
        LEFT JOIN sef_sales_invoice_items i ON f.internal_id = i.invoice_id
        WHERE f.status IN ('Sent', 'Approved') AND f.azurirano_u LIKE ?
        GROUP BY f.internal_id
      `, `${period}%`).toArray();

      const salesRecords = salesRows.map(r => ({ 
        ...r, 
        tipKupca: (String(r.pib_kupca).trim().length === 9) ? 'OBVEZNIK' : 'NEOBVEZNIK',
        naziv_kupca: r.naziv_kupca || 'UNK'
      }));
      const excelXml = SefExcelBuilder.buildPoreskaEvidencija(period, summary, salesRecords, []);

      return new Response(excelXml, {
        headers: { 
          'Content-Type': 'application/vnd.ms-excel; charset=utf-8', 
          'Content-Disposition': `attachment; filename="Poreska_Evidencija_SEF_${period}.xls"`, 
          'Cache-Control': 'no-cache' 
        }
      });
    });

    this.app.get('/analytics/popdv', async ({ req }: RouterContext<Env>) => {
      const url = new URL(req.url);
      const period = url.searchParams.get('period');
      const pib = url.searchParams.get('pib');
      if (!period || !pib) return Response.json({ error: "Missing params" }, { status: 400 });
      return Response.json(this.generatePopdvData(period, pib));
    });

    this.app.get('/reports/popdv', async ({ req }: RouterContext<Env>) => {
      const url = new URL(req.url);
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      if (!from || !to) return Response.json({ error: "Missing range" }, { status: 400 });

      const results = this.sql.exec(`
        SELECT t.tax_category_code, t.tax_percentage, SUM(t.taxable_amount) as total_taxable, SUM(t.tax_amount) as total_tax, COUNT(DISTINCT t.invoice_id) as invoice_count
        FROM sef_purchase_invoice_taxes t
        JOIN sef_purchase_invoices i ON t.invoice_id = i.sef_id
        WHERE i.issue_date BETWEEN ? AND ? AND i.status IN ('Approved', 'Sent', 'New')
        GROUP BY t.tax_category_code, t.tax_percentage
      `, from, to).toArray();

      return Response.json({ from, to, positions: results.map(r => ({ ...r, popdv_ref: this.mapToPopdv(r.tax_category_code as string, r.tax_percentage as number) })) });
    });

    // 3. Webhooks & Ingestion
    this.app.post('/webhooks/sef-update', async ({ req }: RouterContext<Env>) => {
      const url = new URL(req.url);
      const configRez = this.sql.exec(`SELECT sef_subscription_token FROM konfiguracija WHERE id = 1`).toArray();
      const storedToken = configRez[0]?.sef_subscription_token as string | null;
      const incomingToken = url.searchParams.get('token') || req.headers.get('X-SEF-Token') || req.headers.get('Subscription-Key');

      if (storedToken && incomingToken !== storedToken) return Response.json({ error: "Unauthorized" }, { status: 401 });

      const data = await req.json() as any;
      const smer = url.searchParams.get('smer') || data.smer || 'SALES';
      
      try {
        if (smer === 'PURCHASES') {
          this.ctx.storage.transactionSync(() => {
            this.sql.exec(`
              INSERT INTO sef_purchase_invoices (sef_id, invoice_number, supplier_pib, issue_date, total_amount, status, raw_xml)
              VALUES (?, 'WEBHOOK-INIT', '000000000', ?, 0, ?, '<xml_missing>')
              ON CONFLICT(sef_id) DO UPDATE SET status = excluded.status, updated_at = CURRENT_TIMESTAMP
            `, data.faktura_id, data.timestamp || new Date().toISOString(), data.novi_status);
          });
          await this.ctx.storage.setAlarm(Date.now() + 100);
          return Response.json({ success: true, status: 'PURCHASE_WEBHOOK_QUEUED' });
        } else {
          this.ctx.storage.transactionSync(() => {
            this.sql.exec(`
              INSERT INTO fakture (internal_id, sef_id, status, broj_fakture, iznos, azurirano_u)
              VALUES (?, ?, ?, 'WEBHOOK-INIT', 0, CURRENT_TIMESTAMP)
              ON CONFLICT(sef_id) DO UPDATE SET status = excluded.status, azurirano_u = CURRENT_TIMESTAMP
            `, `SEF-ASYNC-${data.faktura_id}`, data.faktura_id, data.novi_status);
          });
          return Response.json({ success: true, status: 'SALES_UPDATED' });
        }
      } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 });
      }
    });

    this.app.get('/api/config/webhook-instructions', async ({ req }) => {
      const configRez = this.sql.exec(`SELECT sef_subscription_token, environment FROM konfiguracija WHERE id = 1`).toArray() as any[];
      const token = configRez[0]?.sef_subscription_token || 'TOKEN_MISSING';
      const environment = configRez[0]?.environment || 'sandbox';
      
      // OKLOP: Dinamičko određivanje base URL-a na osnovu trenutnog zahteva
      const url = new URL(req.url);
      const baseUrl = url.origin;

      // Koristimo klijent_id (ime DO objekta) za rutiranje državnog push-a
      const klijentId = this.ctx.id.toString(); // Wait, this is the hex ID. 
      // In our worker/index.ts we use idFromName(klijentId)
      // So klijentId from register (klijent_PIB) is what we need.
      // But we don't store the 'name' inside the DO easily unless we pass it.
      // Let's check how we handle webhooks in worker/index.ts
      // It expects 'kompanija_pib' in the body.
      
      return Response.json({
        success: true,
        data: {
          koraci: [
            "1. Ulogujte se na svoj SEF portal.", 
            "2. Podešavanja -> API endpointi.",
            "3. Zalepite 'URL za izlazne fakture'.", 
            "4. Zalepite 'URL za ulazne fakture'.",
            "5. Označite 'Isključi notifikacije na e-pošti'.", 
            "6. Sačuvaj."
          ],
          fields: {
            sales_url: `${baseUrl}/api/webhooks/sef`,
            purchase_url: `${baseUrl}/api/webhooks/sef`
          }
        }
      });
    });

    // 4. Invoices & Config
    this.app.post('/fakture/send', async ({ req }: RouterContext<Env>) => {
      const invoiceData = await req.json() as SefInvoiceData;
      const validation = v.safeParse(SefInvoiceSchema, invoiceData);
      if (!validation.success) return Response.json({ error: "Invalid data", details: validation.issues }, { status: 422 });

      const limit = this.checkLimit(1);
      if (!limit.moze) return Response.json(limit.error, { status: 402 });

      this.ctx.storage.transactionSync(() => {
        this.sql.exec(`INSERT OR REPLACE INTO fakture (internal_id, status, broj_fakture, iznos, raw_data) VALUES (?, 'Queued', ?, ?, ?)`, invoiceData.ID, invoiceData.ID, invoiceData.LegalMonetaryTotal.PayableAmount, JSON.stringify(invoiceData));
        this.ekstrahujAnalitikuProdaje(invoiceData, invoiceData.ID);
      });
      this.ctx.waitUntil(this.processQueue());
      return Response.json({ success: true, id: invoiceData.ID }, { status: 202 });
    });

    this.app.post('/fakture/batch', async ({ req }: RouterContext<Env>) => {
      const { fakture } = await req.json() as { fakture: any[] };
      const limit = this.checkLimit(fakture.length);
      if (!limit.moze) return Response.json(limit.error, { status: 402 });

      this.ctx.storage.transactionSync(() => {
        for (const f of fakture) {
          const internalId = f.ID || `BATCH-${Math.random()}`;
          this.sql.exec(`INSERT OR REPLACE INTO fakture (internal_id, status, broj_fakture, iznos, raw_data) VALUES (?, 'Queued', ?, ?, ?)`, internalId, f.ID || 'UNK', f.iznos || 0, JSON.stringify(f));
          this.ekstrahujAnalitikuProdaje(f, internalId);
        }
      });
      this.ctx.waitUntil(this.processQueue());
      return Response.json({ success: true, count: fakture.length }, { status: 202 });
    });

    this.app.patch('/fakture/:id/odbitak', async ({ req, result }: RouterContext<Env>) => {
      const sefId = (result as any).pathname.groups.id;
      const body = await req.json();
      const validation = v.safeParse(PopdvCorrectionSchema, body);
      if (!validation.success) return Response.json({ error: "Invalid data" }, { status: 422 });

      const { taxCategoryCode, nonDeductibleAmount, operater, razlog } = validation.output;
      const periodRow = this.sql.exec(`SELECT strftime('%Y-%m', issue_date) as period FROM sef_purchase_invoices WHERE sef_id = ?`, sefId).toArray() as any[];
      if (periodRow.length > 0 && this.sql.exec(`SELECT 1 FROM sef_popdv_periods WHERE period = ? AND status = 'FINALIZED'`, periodRow[0].period).toArray().length > 0) {
        return Response.json({ error: "Period is locked" }, { status: 403 });
      }

      const current = this.sql.exec(`SELECT tax_amount, non_deductible_amount FROM sef_purchase_invoice_taxes WHERE invoice_id = ? AND tax_category_code = ?`, sefId, taxCategoryCode).toArray() as any[];
      if (current.length === 0) return Response.json({ error: "Not found" }, { status: 404 });

      if (nonDeductibleAmount > current[0].tax_amount) return Response.json({ error: "Too high" }, { status: 400 });

      this.ctx.storage.transactionSync(() => {
        this.sql.exec(`UPDATE sef_purchase_invoice_taxes SET non_deductible_amount = ? WHERE invoice_id = ? AND tax_category_code = ?`, nonDeductibleAmount, sefId, taxCategoryCode);
        this.sql.exec(`INSERT INTO sef_popdv_audit_log (invoice_id, tax_category_code, old_non_deductible, new_non_deductible, operater, razlog) VALUES (?, ?, ?, ?, ?, ?)`, sefId, taxCategoryCode, current[0].non_deductible_amount, nonDeductibleAmount, operater, razlog || null);
      });
      return Response.json({ success: true });
    });

    this.app.get('/config', async () => {
      const config = this.sql.exec(`SELECT webhook_url, environment, sef_subscription_token, klijent_id, plan_name, limit_faktura, (password_hash IS NOT NULL) as has_password FROM konfiguracija WHERE id = 1`).toArray();
      return Response.json(config[0] || { environment: 'sandbox', plan_name: 'Micro' });
    });

    this.app.post('/config', async ({ req }: PicoContext<Env>) => {
      const data = await req.json() as any;
      this.sql.exec(`INSERT OR REPLACE INTO konfiguracija (id, sef_api_key, klijent_id, password_hash, webhook_url, environment, sef_subscription_token, limit_faktura, plan_name) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`, 
        data.sef_api_key || '', 
        data.klijent_id || null,
        data.password_hash || null,
        data.webhook_url || null, 
        data.environment || 'sandbox', 
        data.sef_subscription_token || null, 
        data.limit ?? 50,
        data.plan || 'Micro'
      );
      return Response.json({ success: true });
    });

    this.app.post('/api/internal/verify-password', async ({ req }: PicoContext<Env>) => {
      const { password } = await req.json() as { password?: string };
      if (!password) return new Response(null, { status: 400 });

      const config = this.sql.exec(`SELECT password_hash FROM konfiguracija WHERE id = 1`).toArray() as any[];
      const storedHash = config[0]?.password_hash;

      if (!storedHash) return new Response(null, { status: 404 });

      // OKLOP: Verifikaciju vršimo unutar DO izolacije
      const isCorrect = await AuthEngine.verifyPassword(password, storedHash);
      return Response.json({ success: isCorrect }, { status: isCorrect ? 200 : 401 });
    });

    this.app.get('/stats', async () => {
      const stats = this.sql.exec(`SELECT status, COUNT(*) as broj FROM fakture GROUP BY status`).toArray();
      const pStats = this.sql.exec(`SELECT status, COUNT(*) as broj FROM sef_purchase_invoices GROUP BY status`).toArray();
      
      const configRez = this.sql.exec(`SELECT environment, webhook_url FROM konfiguracija WHERE id = 1`).toArray() as any[];
      const environment = configRez[0]?.environment || 'sandbox';
      const webhook_url = configRez[0]?.webhook_url || null;

      // Zdravstveni indikator: broj grešaka u zadnjih 24h
      const health = this.sql.exec(`SELECT COUNT(*) as broj FROM error_logs WHERE kreirano_u > datetime('now', '-1 day')`).one() as { broj: number };
      
      return Response.json({ 
        stats, 
        purchase_stats: pStats, 
        health: health.broj,
        environment,
        webhook_url,
        klijent_id: this.sql.exec(`SELECT klijent_id FROM konfiguracija WHERE id = 1`).toArray()[0]?.klijent_id || 'unknown'
      });
    });

    this.app.get('/logs', async () => {
      const logs = this.sql.exec(`SELECT * FROM error_logs ORDER BY kreirano_u DESC LIMIT 50`).toArray();
      return Response.json({ logs });
    });

    this.app.get('/fakture', async ({ req }: RouterContext<Env>) => {
      const url = new URL(req.url);
      const page = parseInt(url.searchParams.get('page') || '1');
      const pageSize = 20;
      const offset = (page - 1) * pageSize;
      
      const fakture = this.sql.exec(`
        SELECT internal_id, sef_id, status, broj_fakture, iznos, error_message, azurirano_u 
        FROM fakture 
        ORDER BY azurirano_u DESC 
        LIMIT ? OFFSET ?
      `, pageSize, offset).toArray();
      
      const total = this.sql.exec(`SELECT COUNT(*) as count FROM fakture`).one() as { count: number };
      
      return Response.json({ 
        fakture, 
        pagination: {
          page,
          pageSize,
          total: total.count,
          totalPages: Math.ceil(total.count / pageSize)
        }
      });
    });

    this.app.post('/sync-purchases', async () => {
      await this.initiatePurchaseSync();
      return Response.json({ status: 'STARTED' }, { status: 202 });
    });

    this.app.post('/sync-sef', async () => {
      const res = await this.syncSef();
      // OKLOP: Eksplicitno okidamo procesiranje reda nakon sinhronizacije statusa 
      // kako bi se 'Queued' stavke poslale ako je SEF opet dostupan.
      await this.processQueue();
      return res;
    });
  }

  private initDatabase(): void {
    try {
      this.sql.exec(`ALTER TABLE sef_purchase_invoice_taxes ADD COLUMN non_deductible_amount REAL DEFAULT 0;`);
    } catch (e) {}

    try {
      // OKLOP: Migracija za postojeće DO instance da podrže klijent_id i lozinku
      this.sql.exec(`ALTER TABLE konfiguracija ADD COLUMN klijent_id TEXT;`);
    } catch (e) {}

    try {
      this.sql.exec(`ALTER TABLE konfiguracija ADD COLUMN password_hash TEXT;`);
    } catch (e) {}

    try {
      // OKLOP: Migracija za Enterprise podršku i planove
      this.sql.exec(`ALTER TABLE konfiguracija ADD COLUMN plan_name TEXT DEFAULT 'Micro';`);
    } catch (e) {}

    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS konfiguracija (id INTEGER PRIMARY KEY CHECK (id = 1), sef_api_key TEXT NOT NULL, klijent_id TEXT, password_hash TEXT, sef_subscription_token TEXT, webhook_url TEXT, environment TEXT DEFAULT 'sandbox', limit_faktura INTEGER DEFAULT 50, plan_name TEXT DEFAULT 'Micro');`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS fakture (internal_id TEXT PRIMARY KEY, sef_id TEXT UNIQUE, status TEXT NOT NULL, broj_fakture TEXT NOT NULL, iznos REAL NOT NULL, raw_data TEXT, error_message TEXT, kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP, azurirano_u DATETIME DEFAULT CURRENT_TIMESTAMP);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS sef_purchase_invoices (sef_id TEXT PRIMARY KEY, invoice_number TEXT NOT NULL, supplier_pib TEXT NOT NULL, issue_date TEXT NOT NULL, total_amount REAL NOT NULL, status TEXT NOT NULL, raw_xml TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS sef_sync_watermarks (id INTEGER PRIMARY KEY AUTOINCREMENT, sync_type TEXT NOT NULL, last_successful_date TEXT NOT NULL, current_page INTEGER DEFAULT 1, status TEXT NOT NULL, records_synced INTEGER DEFAULT 0, error_message TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS sef_purchase_invoice_items (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id TEXT NOT NULL, line_extension_amount REAL NOT NULL, item_name TEXT NOT NULL, quantity REAL NOT NULL, unit_code TEXT, tax_percent REAL NOT NULL, tax_amount REAL NOT NULL, FOREIGN KEY(invoice_id) REFERENCES sef_purchase_invoices(sef_id) ON DELETE CASCADE);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS sef_purchase_invoice_taxes (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id TEXT NOT NULL, taxable_amount REAL NOT NULL, tax_amount REAL NOT NULL, tax_percentage REAL NOT NULL, tax_category_code TEXT NOT NULL, non_deductible_amount REAL DEFAULT 0, FOREIGN KEY(invoice_id) REFERENCES sef_purchase_invoices(sef_id) ON DELETE CASCADE);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS sef_popdv_audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id TEXT NOT NULL, tax_category_code TEXT NOT NULL, old_non_deductible REAL NOT NULL, new_non_deductible REAL NOT NULL, operater TEXT NOT NULL, razlog TEXT, kreirano_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(invoice_id) REFERENCES sef_purchase_invoices(sef_id) ON DELETE CASCADE);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS sef_popdv_submissions (period TEXT PRIMARY KEY, status TEXT NOT NULL, payload_snapshot TEXT NOT NULL, state_receipt_id TEXT, error_message TEXT, locked_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS sef_popdv_periods (period TEXT PRIMARY KEY, status TEXT NOT NULL, draft_id TEXT, broj_prijave TEXT, azurirano_at DATETIME DEFAULT CURRENT_TIMESTAMP);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS sef_sales_invoice_items (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id TEXT NOT NULL, line_extension_amount REAL NOT NULL, item_name TEXT NOT NULL, quantity REAL NOT NULL, unit_code TEXT, tax_percent REAL NOT NULL, tax_amount REAL NOT NULL, FOREIGN KEY(invoice_id) REFERENCES fakture(internal_id) ON DELETE CASCADE);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS sef_sales_invoice_taxes (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id TEXT NOT NULL, taxable_amount REAL NOT NULL, tax_amount REAL NOT NULL, tax_percentage REAL NOT NULL, tax_category_code TEXT NOT NULL, FOREIGN KEY(invoice_id) REFERENCES fakture(internal_id) ON DELETE CASCADE);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS tenant_config (kljuc TEXT PRIMARY KEY, vrednost TEXT, azurirano_at INTEGER DEFAULT (strftime('%s', 'now')));`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS istorija_statusa (id INTEGER PRIMARY KEY AUTOINCREMENT, faktura_id TEXT NOT NULL, status TEXT NOT NULL, kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(faktura_id) REFERENCES fakture(internal_id) ON DELETE CASCADE);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS error_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, internal_id TEXT, sef_id TEXT, error_message TEXT NOT NULL, status_code INTEGER, kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP);`);
    });
  }

  override async alarm(): Promise<void> {
    const activeSales = this.sql.exec(`SELECT COUNT(*) as broj FROM fakture WHERE status = 'Queued' OR status = 'Processing'`).one() as { broj: number };
    if (activeSales.broj > 0) await this.processQueue();
    const activeSync = this.sql.exec(`SELECT id FROM sef_sync_watermarks WHERE sync_type = 'PURCHASES' AND status = 'RUNNING'`).toArray();
    if (activeSync.length > 0) await this.runPurchaseSync();
  }

  private async initiatePurchaseSync() {
    let lastWatermark = this.sql.exec(`SELECT last_successful_date FROM sef_sync_watermarks WHERE sync_type = 'PURCHASES' AND status = 'COMPLETED' ORDER BY id DESC LIMIT 1`).toArray()[0]?.last_successful_date;
    if (!lastWatermark) {
      const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      lastWatermark = thirtyDaysAgo.toISOString();
    }
    this.sql.exec(`INSERT INTO sef_sync_watermarks (sync_type, last_successful_date, current_page, status) VALUES ('PURCHASES', ?, 1, 'RUNNING')`, lastWatermark);
    await this.ctx.storage.setAlarm(Date.now() + 100);
  }

  private async runPurchaseSync() {
    if (this.isSyncingPurchases) return;
    this.isSyncingPurchases = true;
    try {
      const current = this.sql.exec(`SELECT id, last_successful_date, current_page, records_synced FROM sef_sync_watermarks WHERE sync_type = 'PURCHASES' AND status = 'RUNNING' ORDER BY id DESC LIMIT 1`).toArray()[0] as any;
      if (!current) return;
      const configRes = this.sql.exec(`SELECT sef_api_key, environment FROM konfiguracija WHERE id = 1`).toArray();
      const config = configRes[0] as any;
      if (!config) return;
      const client = new SefClient({ 
        apiKey: config.sef_api_key, 
        environment: config.environment,
        baseUrl: config.environment === 'production' ? 'https://efaktura.mfin.gov.rs' : 'https://demoefaktura.mfin.gov.rs'
      });
      const result = await client.getPurchaseInvoiceChanges(current.last_successful_date, new Date().toISOString(), current.current_page);
      if (result && result.invoices) {
        for (const inv of result.invoices) {
          const xml = await client.downloadPurchaseInvoiceXml(inv.purchaseInvoiceId) || '<xml_failed>';
          this.sql.exec(`INSERT INTO sef_purchase_invoices (sef_id, invoice_number, supplier_pib, issue_date, total_amount, status, raw_xml) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(sef_id) DO UPDATE SET status = excluded.status, raw_xml = excluded.raw_xml`, inv.purchaseInvoiceId.toString(), inv.invoiceNumber, inv.supplierTin, inv.date, inv.amount, inv.invoiceStatus, xml);
          // LORBEROV oklop: Prepustite nit V8 engine-u tokom sinkovanja da ne blokira upite
          await yieldToEventLoop();
        }
        this.sql.exec(`UPDATE sef_sync_watermarks SET status = 'COMPLETED', last_successful_date = CURRENT_TIMESTAMP WHERE id = ?`, current.id);
        this.processUnparsedInvoices();
      }
    } finally { this.isSyncingPurchases = false; }
  }

  public processUnparsedInvoices() {
    const unparsed = this.sql.exec(`SELECT sef_id, raw_xml FROM sef_purchase_invoices WHERE raw_xml IS NOT NULL AND raw_xml NOT IN ('<xml_missing>', '<xml_failed>') AND sef_id NOT IN (SELECT DISTINCT invoice_id FROM sef_purchase_invoice_items) LIMIT 50`).toArray() as any[];
    this.ctx.storage.transactionSync(() => {
      for (const row of unparsed) {
        try {
          const data = SefUblParser.extract(row.raw_xml, row.sef_id);
          for (const item of data.items) this.sql.exec(`INSERT INTO sef_purchase_invoice_items (invoice_id, line_extension_amount, item_name, quantity, unit_code, tax_percent, tax_amount) VALUES (?, ?, ?, ?, ?, ?, ?)`, data.invoiceId, item.lineExtensionAmount, item.itemName, item.quantity, item.unitCode, item.taxPercent, item.taxAmount);
          for (const tax of data.taxes) this.sql.exec(`INSERT INTO sef_purchase_invoice_taxes (invoice_id, taxable_amount, tax_amount, tax_percentage, tax_category_code) VALUES (?, ?, ?, ?, ?)`, data.invoiceId, tax.taxableAmount, tax.taxAmount, tax.taxPercentage, tax.taxCategoryCode);
        } catch (e) {}
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isDraining) return;
    this.isDraining = true;
    try {
      while (true) {
        const next = this.sql.exec(`SELECT internal_id, raw_data FROM fakture WHERE status = 'Queued' ORDER BY kreirano_u ASC LIMIT 1`).toArray() as any[];
        if (next.length === 0) break;
        const configRes = this.sql.exec(`SELECT sef_api_key, environment FROM konfiguracija WHERE id = 1`).toArray();
        const config = configRes[0] as any;
        if (!config) break;
        const client = new SefClient({ 
        apiKey: config.sef_api_key, 
        environment: config.environment,
        baseUrl: config.environment === 'production' ? 'https://efaktura.mfin.gov.rs' : 'https://demoefaktura.mfin.gov.rs'
      });
        const result = await client.sendInvoice(SefXmlBuilder.build(JSON.parse(next[0].raw_data)), next[0].internal_id);
        if (result.success) {
          this.sql.exec(`UPDATE fakture SET sef_id = ?, status = 'Sent' WHERE internal_id = ?`, result.salesInvoiceId?.toString(), next[0].internal_id);
        } else {
          // OKLOP: Diferencijalno rukovanje greškama
          // Ako je u pitanju 503 (SEF Down), ostavljamo Queued i prekidamo batch
          if (result.error?.includes('503') || result.error?.includes('Service Unavailable')) {
             break;
          }
          // Za ostale fatalne greške (npr. 400 Bad Request), markiramo kao Failed
          this.sql.exec(`UPDATE fakture SET status = 'Failed', error_message = ? WHERE internal_id = ?`, result.error || 'Unknown Error', next[0].internal_id);
        }

        // LORBEROV oklop: Prepustite nit V8 engine-u nakon svake fakture
        await yieldToEventLoop();
      }
    } finally { this.isDraining = false; }
  }

  private checkLimit(noviBroj: number): { moze: boolean, error?: any } {
    const configRez = this.sql.exec(`SELECT plan_name, limit_faktura FROM konfiguracija WHERE id = 1`).toArray() as any[];
    const plan = configRez[0]?.plan_name || 'Micro';
    
    // ENTERPRISE OKLOP: Zaobilazimo limite i logujemo masovnu operaciju
    if (plan === 'Enterprise') {
      this.sql.exec(
        `INSERT INTO error_logs (internal_id, error_message, status_code) 
         VALUES ('SYSTEM', 'Enterprise batch: Propušteno ${noviBroj} dokumenata bez restrikcija.', 200)`
      );
      return { moze: true };
    }

    const limit = parseInt(configRez[0]?.limit_faktura || '50');
    
    const count = this.sql.exec(`
      SELECT COUNT(*) as broj FROM fakture 
      WHERE strftime('%m', kreirano_u) = strftime('%m', 'now')
      AND strftime('%Y', kreirano_u) = strftime('%Y', 'now')
    `).one() as { broj: number };

    if (count.broj + noviBroj > limit) {
      return { 
        moze: false, 
        error: { 
          error: "Limit paketa je pređen. Nadogradite nalog na Enterprise za neograničeno slanje.",
          trenutno: count.broj,
          limit,
          paket: plan
        } 
      };
    }
    return { moze: true };
  }

  private async syncSef(): Promise<Response> {
    const configRes = this.sql.exec(`SELECT sef_api_key, environment FROM konfiguracija WHERE id = 1`).toArray();
    const config = configRes[0] as any;
    if (!config) return Response.json({ error: "Missing config" }, { status: 400 });
    const client = new SefClient({ 
      apiKey: config.sef_api_key, 
      environment: config.environment,
      baseUrl: config.environment === 'production' ? 'https://efaktura.mfin.gov.rs' : 'https://demoefaktura.mfin.gov.rs'
    });
    const fakture = this.sql.exec(`SELECT internal_id, sef_id, status FROM fakture WHERE status NOT IN ('Approved', 'Rejected', 'Cancelled') AND sef_id IS NOT NULL`).toArray() as any[];
    for (const f of fakture) {
      const data = await client.getInvoiceStatus(parseInt(f.sef_id));
      if (data && data.InvoiceStatus && data.InvoiceStatus !== f.status) {
        this.sql.exec(`UPDATE fakture SET status = ? WHERE internal_id = ?`, data.InvoiceStatus, f.internal_id);
      }
    }
    return Response.json({ ok: true });
  }

  private mapToPopdv(category: string, percent: number): string {
    const mapping: Record<string, string> = { 'S-20': '8.3', 'S-10': '8.4', 'AE-20': '8a.1', 'AE-10': '8a.2' };
    return mapping[`${category}-${percent}`] || '8.x';
  }

  public getPppdvSummary(period: string): PppdvSummary {
    const s = this.sql.exec(`SELECT SUM(CASE WHEN t.tax_percentage = 20.0 THEN t.taxable_amount ELSE 0 END) as b20, SUM(CASE WHEN t.tax_percentage = 20.0 THEN t.tax_amount ELSE 0 END) as p20 FROM sef_sales_invoice_taxes t JOIN fakture f ON t.invoice_id = f.internal_id WHERE f.status IN ('Sent', 'Approved') AND f.azurirano_u LIKE ?`, `${period}%`).toArray()[0] as any;
    const p = this.sql.exec(`SELECT SUM(t.tax_amount - t.non_deductible_amount) as cist FROM sef_purchase_invoice_taxes t JOIN sef_purchase_invoices p ON t.invoice_id = p.sef_id WHERE p.status = 'Approved' AND p.issue_date LIKE ?`, `${period}%`).toArray()[0] as any;
    return { period, pozicija001_osnovica20: s.b20 || 0, pozicija101_pdv20: s.p20 || 0, pozicija002_osnovica10: 0, pozicija102_pdv10: 0, pozicija003_oslobodjenSaPravom: 0, pozicija008_prethodniPorezOdbitni: p.cist || 0, porezZaUplatuIliPovracaj: (s.p20 || 0) - (p.cist || 0) };
  }

  public generatePopdvData(period: string, tenantPib: string): PopdvSubmitData {
    const d8 = this.sql.exec(`SELECT p.sef_id, p.invoice_number, p.supplier_pib, p.issue_date, SUM(CASE WHEN t.tax_percentage = 20.0 THEN t.taxable_amount ELSE 0 END) as b20, SUM(CASE WHEN t.tax_percentage = 20.0 THEN t.tax_amount ELSE 0 END) as p20, SUM(t.non_deductible_amount) as nd FROM sef_purchase_invoices p JOIN sef_purchase_invoice_taxes t ON p.sef_id = t.invoice_id WHERE p.status IN ('Approved', 'Sent', 'New') AND p.issue_date LIKE ? GROUP BY p.sef_id`, `${period}%`).toArray() as any[];
    const d3 = this.sql.exec(`SELECT f.internal_id, f.broj_fakture, f.azurirano_u, json_extract(f.raw_data, '$.Customer.Pib') as pib, json_extract(f.raw_data, '$.Customer.Name') as name, SUM(CASE WHEN t.tax_percentage = 20.0 THEN t.taxable_amount ELSE 0 END) as b20, SUM(CASE WHEN t.tax_percentage = 20.0 THEN t.tax_amount ELSE 0 END) as p20 FROM fakture f LEFT JOIN sef_sales_invoice_taxes t ON f.internal_id = t.invoice_id WHERE f.status IN ('Sent', 'Approved') AND f.azurirano_u LIKE ? GROUP BY f.internal_id`, `${period}%`).toArray() as any[];
    return { poreskiPeriod: period, pibObveznika: tenantPib, deo3: d3.map((r, i) => ({ redniBroj: i+1, pibKupca: r.pib || '', nazivKupca: r.name || 'UNK', brojRacuna: r.broj_fakture, datumRacuna: r.azurirano_u.substring(0,10), osnovica20: r.b20 || 0, pdv20: r.p20 || 0, osnovica10: 0, pdv10: 0, oslobodjenPromet: 0, tipKupca: (r.pib?.length === 9) ? 'OBVEZNIK' : 'NEOBVEZNIK' })), deo8: d8.map((r, i) => ({ redniBroj: i+1, pibDobavljaca: r.supplier_pib.replace(/[^0-9]/g, ''), nazivDobavljaca: "UNK", brojRacuna: r.invoice_number, datumRacuna: r.issue_date.substring(0,10), iznosBezPdv: r.b20 || 0, iznosPdv20: r.p20 || 0, iznosPdv10: 0, iznosKojiSeNeOdbija: r.nd || 0 })) };
  }

  public ekstrahujAnalitikuProdaje(invoiceData: SefInvoiceData, internalId: string): void {
    this.sql.exec("DELETE FROM sef_sales_invoice_items WHERE invoice_id = ?", internalId);
    this.sql.exec("DELETE FROM sef_sales_invoice_taxes WHERE invoice_id = ?", internalId);

    const lines = invoiceData.Lines || [];
    for (const line of lines) {
      this.sql.exec(`INSERT INTO sef_sales_invoice_items (invoice_id, line_extension_amount, item_name, quantity, unit_code, tax_percent, tax_amount) VALUES (?, ?, ?, ?, ?, ?, ?)`, internalId, line.LineExtensionAmount, line.ItemName, line.Quantity, line.UnitCode, line.VatPercent, 0.0);
    }

    const taxTotals = invoiceData.TaxTotals || [];
    for (const taxTotal of taxTotals) {
      for (const subtotal of taxTotal.Subtotals) {
        this.sql.exec(`INSERT INTO sef_sales_invoice_taxes (invoice_id, taxable_amount, tax_amount, tax_percentage, tax_category_code) VALUES (?, ?, ?, ?, ?)`, internalId, subtotal.TaxableAmount, subtotal.TaxAmount, subtotal.Percent, subtotal.Category);
      }
    }
  }
}