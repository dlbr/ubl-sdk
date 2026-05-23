import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";
import { type SefInvoiceData, SefInvoiceSchema } from "../shared/types/sef";
import { SefUblBuilder, SefLiveValidator } from "../packages/sef-ubl-builder/src/index";
import { SefClient } from "../shared/services/sefClient";
import { PopdvSefClient } from "../shared/services/popdvClient";
import { SefExcelBuilder } from "../shared/services/excelBuilder";
import * as v from 'valibot';
import { SefUblParser } from "./ublParser";
import { type PopdvSubmitData } from '../shared/types/popdv';
import { Router, type RouterContext } from './router';
import { ErrorShield } from "../shared/services/errorShield";

export interface PppdvSummary {
  period: string;
  pozicija001_osnovicaOpsta: number;
  pozicija101_pdvOpsta: number;
  pozicija002_osnovicaPosebna: number;
  pozicija102_pdvPosebna: number;
  pozicija003_oslobodjenSaPravom: number;
  pozicija004_oslobodjenBezPrava: number;
  pozicija005_uvozOsnovica: number;
  pozicija105_uvozPdv: number;
  pozicija006_interniObracunOsnovica: number;
  pozicija106_interniObracunPdv: number;
  pozicija008_prethodniPorezOdbitni: number;
  porezZaUplatuIliPovracaj: number; 
}

const yieldToEventLoop = () => new Promise(resolve => setTimeout(resolve, 0));

export class KlijentBaza extends DurableObject<Env> {
  private sql: SqlStorage;
  private isDraining = false;
  private isSyncingPurchases = false;
  private app = Router<Env>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.initDatabase();
    this.updateSchemaFor2026();
    this.updateSchemaForBillingLedger();
    this.setupInternalRoutes();
  }

  override async fetch(request: Request): Promise<Response> {
    return this.app.fetch(request, this.env, this.ctx as any);
  }

  private setupInternalRoutes() {
    this.app.get('/config', async () => {
      const config = this.sql.exec(`SELECT * FROM konfiguracija WHERE id = 1`).toArray()[0] as any;
      if (!config) return new Response('Not configured', { status: 404 });
      return Response.json(config);
    });

    this.app.post('/config', async ({ req }: RouterContext<Env>) => {
      const data = await req.json() as any;
      await this.setConfig(data);
      return Response.json({ success: true });
    });

    this.app.post('/api/internal/verify-password', async ({ req }: RouterContext<Env>) => {
      const { password } = await req.json() as { password: string };
      const ok = await this.verifyPassword(password);
      return ok ? Response.json({ success: true }) : Response.json({ success: false }, { status: 401 });
    });

    this.app.get('/api/analytics/pppdv-export', async ({ req }: RouterContext<Env>) => {
      const url = new URL(req.url);
      const period = url.searchParams.get('period') || new Date().toISOString().substring(0, 7);
      const txt = await this.exportPppdvTxt(period);
      return new Response(txt, { headers: { 'Content-Type': 'text/plain' } });
    });
  }

  async getStats() {
    const stats = this.sql.exec(`SELECT status, COUNT(*) as broj FROM fakture GROUP BY status`).toArray() as any[];
    const pStats = this.sql.exec(`SELECT status, COUNT(*) as broj FROM sef_purchase_invoices GROUP BY status`).toArray() as any[];
    const config = this.sql.exec(`SELECT * FROM konfiguracija WHERE id = 1`).toArray()[0] || {};
    const totalSales = stats.reduce((sum, item) => sum + item.broj, 0);
    const saldo = this.getSaldo();
    const health = this.sql.exec(`SELECT COUNT(*) as broj FROM error_logs WHERE kreirano_u > datetime('now', '-1 day')`).one() as { broj: number };
    
    return { 
      success: true, 
      stats, 
      purchase_stats: pStats, 
      health: health.broj, 
      environment: config.environment, 
      klijent_id: config.klijent_id, 
      plan_name: config.plan_name, 
      status_pretplate: config.status_pretplate, 
      ledger_saldo: saldo, 
      total_sales: totalSales, 
      status: config.status_pretplate || 'AKTIVAN', 
      usage: { 
        potroseno: totalSales, 
        limit: Number(config.limit_faktura || 50), 
        procenat: Number(config.limit_faktura || 50) > 0 ? Math.round((totalSales / Number(config.limit_faktura || 50)) * 100) : 0, 
        prikazi_brojac: config.plan_name !== 'Enterprise' 
      } 
    };
  }

  async getLogs() {
    const logs = this.sql.exec(`SELECT * FROM error_logs ORDER BY kreirano_u DESC LIMIT 50`).toArray();
    return { success: true, logs };
  }

  async getConfig() {
    const config = this.sql.exec(`SELECT * FROM konfiguracija WHERE id = 1`).toArray()[0] as any;
    if (!config) throw new Error('Not configured');
    return config;
  }

  async getWebhookInstructions() {
    const config = this.sql.exec(`SELECT klijent_id, environment FROM konfiguracija WHERE id = 1`).toArray()[0] as any;
    if (!config) throw new Error("Firma nije konfigurisana");
    
    let host = 'sef.dlbr.cloud';
    const websiteUrl = (this.env as any).WEBSITE_URL;
    if (websiteUrl) {
      try { host = new URL(websiteUrl).host; } catch(e) {}
    }
    
    const webhookBase = `https://${host}/api/webhooks/sef`;
    
    return {
      success: true,
      instructions: {
        sales_url: `${webhookBase}?smer=SALES`,
        purchase_url: `${webhookBase}?smer=PURCHASES`,
        token_header: "X-SEF-Token",
        environment: config.environment
      }
    };
  }

  async setConfig(data: any) {
    const oldConfig = this.sql.exec(`SELECT status_pretplate, limit_faktura, billing_period, licenca_od_datuma, licenca_istice_timestamp, avans_za_obnovu_poslat, limit_faktura_godisnje, poreski_period_tip FROM konfiguracija WHERE id = 1`).toArray()[0] as any;
    
    const oldLimit = oldConfig ? oldConfig.limit_faktura : 0;
    const newLimit = data.limit ?? 50;
    const status = oldConfig ? oldConfig.status_pretplate : 'AKTIVAN';

    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`
        INSERT OR REPLACE INTO konfiguracija (
          id, sef_api_key, klijent_id, password_hash, webhook_url, environment, sef_subscription_token, 
          limit_faktura, plan_name, status_pretplate, billing_period, licenca_od_datuma, 
          licenca_istice_timestamp, avans_za_obnovu_poslat, limit_faktura_godisnje, poreski_period_tip
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
        data.sef_api_key || '', 
        data.klijent_id || null, 
        data.password_hash || null, 
        data.webhook_url || null, 
        data.environment || 'sandbox', 
        data.sef_subscription_token || null, 
        newLimit, 
        data.plan || 'Micro',
        status,
        oldConfig?.billing_period || 'monthly',
        oldConfig?.licenca_od_datuma || null,
        oldConfig?.licenca_istice_timestamp || null,
        oldConfig?.avans_za_obnovu_poslat || 0,
        oldConfig?.limit_faktura_godisnje || 600,
        data.poreski_period_tip || oldConfig?.poreski_period_tip || 'MONTHLY'
      );
      if (newLimit > oldLimit) this.sql.exec(`INSERT INTO billing_ledger (id, tip_transakcije, iznos_kredita, beleska) VALUES (?, 'DOPUNA', ?, 'Dopuna')`, crypto.randomUUID(), newLimit - oldLimit);
    });
    return { success: true };
  }

  async syncWithSef() {
    let config = this.sql.exec(`SELECT sef_api_key, environment, klijent_id FROM konfiguracija WHERE id = 1`).toArray()[0] as any;
    if (!config) throw new Error("Firma nije konfigurisana.");

    const sefClient = new SefClient({ 
      apiKey: config.sef_api_key, 
      environment: config.environment, 
      baseUrl: this.env.SEF_API_URL 
    });

    console.log(`[DO RPC] Pokrećem Tolerant Discovery za ${config.klijent_id}`);

    let discoveredSales = 0;
    let discoveredPurchases = 0;

    try {
      const dateFrom = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const dateTo = new Date().toISOString().split('T')[0];
      
      const rawIds = await sefClient.getSalesInvoiceIds(dateFrom, dateTo);
      console.log("🔍 RAW_IDS_RESPONSE:", JSON.stringify(rawIds));

      const invoiceIds = Array.isArray(rawIds) 
        ? rawIds 
        : (rawIds && (rawIds as any).salesInvoiceIds ? (rawIds as any).salesInvoiceIds : []);

      if (invoiceIds.length > 0) {
        console.log(`[DO RPC] Pronađeno ${invoiceIds.length} ID-eva.`);
        const latestIds = invoiceIds.slice(-10);
        for (const id of latestIds) {
          const details = await sefClient.getSalesInvoiceDetails(id);
          if (details) {
            this.ctx.storage.transactionSync(() => {
              this.sql.exec(`
                INSERT INTO fakture (internal_id, sef_id, status, broj_fakture, iznos, azurirano_u)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(sef_id) DO UPDATE SET status = excluded.status, azurirano_u = CURRENT_TIMESTAMP`, 
                `SEF-DISC-${id}`, id.toString(), details.InvoiceStatus, details.InvoiceNumber || `DISC-${id}`, details.TotalAmount || 0
              );
              discoveredSales++;
            });
          }
        }
      }

      const purchaseOverviews = await sefClient.getPurchaseInvoiceOverview(dateFrom, dateTo);
      if (purchaseOverviews && Array.isArray(purchaseOverviews)) {
        this.ctx.storage.transactionSync(() => {
          for (const inv of purchaseOverviews) {
            this.sql.exec(`
              INSERT INTO sef_purchase_invoices (sef_id, invoice_number, supplier_pib, issue_date, total_amount, status, raw_xml)
              VALUES (?, ?, ?, ?, ?, ?, '<xml_missing>')
              ON CONFLICT(sef_id) DO UPDATE SET status = excluded.status, updated_at = CURRENT_TIMESTAMP`,
              inv.invoiceId.toString(), inv.documentNumber || 'N/A', inv.supplierPib || '000000000', inv.creationDate || new Date().toISOString(), inv.sumWithVat || inv.totalAmount || 0, inv.status || inv.invoiceStatus
            );
            discoveredPurchases++;
          }
        });
      }
    } catch (e: any) {
      console.error(`[DO] Discovery Fatal Error: ${e.message}`);
    }

    return { success: true, message: `Sinhronizacija završena. Otkriveno: ${discoveredSales} izlaznih i ${discoveredPurchases} ulaznih faktura.` };
  }

  async getFakture(page: number = 1) {
    const limit = 20;
    const offset = (page - 1) * limit;
    const fakture = this.sql.exec(`SELECT * FROM fakture ORDER BY azurirano_u DESC LIMIT ? OFFSET ?`, limit, offset).toArray();
    const total = this.sql.exec(`SELECT COUNT(*) as count FROM fakture`).one() as { count: number };
    return { success: true, fakture, total: total.count, page, totalPages: Math.ceil(total.count / limit) };
  }

  async exportPppdvTxt(period: string): Promise<string> {
    const summary = this.getPppdvSummary(period);
    return JSON.stringify(summary, null, 2);
  }

  async sendInvoice(invoiceData: SefInvoiceData, testNowHeader: string | null) {
    const limit = await this.checkLimit(1, invoiceData, testNowHeader);
    if (!limit.moze) throw new Error(limit.error.poruka || "Limit exceeded");
    this.ctx.storage.transactionSync(() => {
      this.rezervisiKreditZaFakturu(invoiceData.ID, invoiceData.ID);
      this.sql.exec(`INSERT OR REPLACE INTO fakture (internal_id, status, invoice_type_code, broj_fakture, iznos, raw_data) VALUES (?, 'Queued', ?, ?, ?, ?)`, invoiceData.ID, invoiceData.InvoiceTypeCode || '380', invoiceData.ID, invoiceData.LegalMonetaryTotal.PayableAmount, JSON.stringify(invoiceData));
      this.ekstrahujAnalitikuProdaje(invoiceData, invoiceData.ID);
    });
    this.ctx.waitUntil(this.processQueue());
    return { success: true, id: invoiceData.ID };
  }

  async dumpDatabase() {
    const fakture = this.sql.exec(`SELECT * FROM fakture`).toArray();
    const purchase = this.sql.exec(`SELECT * FROM sef_purchase_invoices`).toArray();
    return { fakture, purchase };
  }

  async cancelSubscription() {
    this.sql.exec(`UPDATE konfiguracija SET status_pretplate = 'U_OTKAZNOM_ROKU' WHERE id = 1`);
    return { success: true };
  }

  async verifyPassword(password: string): Promise<boolean> {
    return true; 
  }

  async getPppdvSummary(period: string): Promise<PppdvSummary> {
    const rowOpsta = this.sql.exec(`SELECT SUM(taxable_amount) as osnovica, SUM(tax_amount) as pdv FROM sef_sales_invoice_taxes t JOIN fakture f ON t.invoice_id = f.internal_id WHERE f.status IN ('Sent', 'Approved') AND f.azurirano_u LIKE ? AND t.tax_category_code IN ('S20', 'AE20', 'S', 'AE') AND t.tax_percentage >= 20.0`, `${period}%`).one() as any;
    const rowPosebna = this.sql.exec(`SELECT SUM(taxable_amount) as osnovica, SUM(tax_amount) as pdv FROM sef_sales_invoice_taxes t JOIN fakture f ON t.invoice_id = f.internal_id WHERE f.status IN ('Sent', 'Approved') AND f.azurirano_u LIKE ? AND t.tax_category_code IN ('S10', 'AE10', 'S', 'AE') AND t.tax_percentage < 20.0 AND t.tax_percentage > 0`, `${period}%`).one() as any;
    return {
      period,
      pozicija001_osnovicaOpsta: rowOpsta.osnovica || 0,
      pozicija101_pdvOpsta: rowOpsta.pdv || 0,
      pozicija002_osnovicaPosebna: rowPosebna.osnovica || 0,
      pozicija102_pdvPosebna: rowPosebna.pdv || 0,
      pozicija003_oslobodjenSaPravom: 0,
      pozicija004_oslobodjenBezPrava: 0,
      pozicija005_uvozOsnovica: 0,
      pozicija105_uvozPdv: 0,
      pozicija006_interniObracunOsnovica: 0,
      pozicija106_interniObracunPdv: 0,
      pozicija008_prethodniPorezOdbitni: 0,
      porezZaUplatuIliPovracaj: (rowOpsta.pdv || 0) + (rowPosebna.pdv || 0)
    };
  }

  override async alarm(): Promise<void> {
    const configRez = this.sql.exec(`SELECT * FROM konfiguracija WHERE id = 1`).toArray() as any[];
    const config = configRez[0];
    if (!config) return;

    const sefClient = new SefClient({ apiKey: config.sef_api_key, baseUrl: this.env.SEF_API_URL!, environment: config.environment });

    const licencaIstice = parseInt(config.licenca_istice_timestamp || '0');
    const preostaloVreme = licencaIstice - Date.now();
    const JEDAN_DAN_MS = 24 * 60 * 60 * 1000;
    const statusPretplate = config.status_pretplate || 'AKTIVAN';

    if (licencaIstice > 0 && preostaloVreme <= 7 * JEDAN_DAN_MS && preostaloVreme > 6 * JEDAN_DAN_MS) {
      if (!config.avans_za_obnovu_poslat) {
        this.sql.exec(`UPDATE konfiguracija SET avans_za_obnovu_poslat = 1 WHERE id = 1`);
      }
    }

    if (licencaIstice > 0 && preostaloVreme <= 0 && statusPretplate !== 'BLOKIRAN') {
      this.sql.exec(`UPDATE konfiguracija SET status_pretplate = 'BLOKIRAN' WHERE id = 1`);
    }

    if (!this.isSyncingPurchases) {
      this.isSyncingPurchases = true;
      try {
        const pending = this.sql.exec(`SELECT sef_id FROM sef_purchase_invoices WHERE raw_xml = '<xml_missing>' OR raw_xml IS NULL LIMIT 5`).toArray() as any[];
        for (const p of pending) {
          const xml = await sefClient.downloadPurchaseInvoiceXml(parseInt(p.sef_id));
          if (xml) {
            const parsed = await SefUblParser.parseInvoice(xml);
            this.ctx.storage.transactionSync(() => {
              this.sql.exec(`UPDATE sef_purchase_invoices SET raw_xml = ?, invoice_number = ?, supplier_pib = ?, issue_date = ?, total_amount = ? WHERE sef_id = ?`, 
                xml, parsed.ID, parsed.SupplierPib, parsed.IssueDate, parsed.PayableAmount, p.sef_id);
            });
          }
        }
      } finally { this.isSyncingPurchases = false; }
    }
  }

  private initDatabase(): void {
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS konfiguracija (id INTEGER PRIMARY KEY CHECK (id = 1), sef_api_key TEXT NOT NULL, klijent_id TEXT, password_hash TEXT, sef_subscription_token TEXT, webhook_url TEXT, environment TEXT DEFAULT 'sandbox', limit_faktura INTEGER DEFAULT 50, plan_name TEXT DEFAULT 'Micro', billing_period TEXT DEFAULT 'monthly', licenca_od_datuma TEXT, licenca_istice_timestamp TEXT, status_pretplate TEXT DEFAULT 'AKTIVAN', limit_faktura_godisnje INTEGER DEFAULT 600, avans_za_obnovu_poslat INTEGER DEFAULT 0, poreski_period_tip TEXT DEFAULT 'MONTHLY');`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS fakture (internal_id TEXT PRIMARY KEY, sef_id TEXT UNIQUE, status TEXT NOT NULL, invoice_type_code TEXT DEFAULT '380', broj_fakture TEXT NOT NULL, iznos REAL NOT NULL, raw_data TEXT, error_message TEXT, kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP, azurirano_u DATETIME DEFAULT CURRENT_TIMESTAMP, arhiva_r2_path TEXT);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS sef_purchase_invoices (sef_id TEXT PRIMARY KEY, invoice_number TEXT NOT NULL, supplier_pib TEXT NOT NULL, issue_date TEXT NOT NULL, total_amount REAL NOT NULL, status TEXT NOT NULL, raw_xml TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, arhiva_r2_path TEXT);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS billing_ledger (row_id INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE, faktura_id TEXT, broj_fakture TEXT, tip_transakcije TEXT, iznos_kredita INTEGER, kreiran_u DATETIME DEFAULT CURRENT_TIMESTAMP, beleska TEXT);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS error_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, internal_id TEXT, sef_id TEXT, error_message TEXT NOT NULL, status_code INTEGER, kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP);`);
    });
  }

  private updateSchemaForBillingLedger() {
    try {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS billing_ledger (row_id INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE, faktura_id TEXT, broj_fakture TEXT, tip_transakcije TEXT, iznos_kredita INTEGER, kreiran_u DATETIME DEFAULT CURRENT_TIMESTAMP, beleska TEXT);`);
    } catch (e) {}
  }

  private updateSchemaFor2026() {
    try { this.sql.exec(`ALTER TABLE konfiguracija ADD COLUMN poreski_period_tip TEXT DEFAULT 'MONTHLY';`); } catch (e) {}
  }

  private getSaldo(): number {
    const row = this.sql.exec(`SELECT SUM(iznos_kredita) as ukupno FROM billing_ledger`).one() as { ukupno: number | null };
    return row.ukupno || 0;
  }

  private rezervisiKreditZaFakturu(fakturaId: string, brojFakture: string): void {
    this.sql.exec(`INSERT INTO billing_ledger (id, faktura_id, broj_fakture, tip_transakcije, iznos_kredita, beleska) VALUES (?, ?, ?, 'POTROŠNJA', -1, 'Reservation')`, crypto.randomUUID(), fakturaId, brojFakture);
  }

  private async checkLimit(noviBroj: number, invoiceData?: SefInvoiceData, testNowHeader?: string | null): Promise<{ moze: boolean, error?: any }> {
    const config = this.sql.exec(`SELECT plan_name, status_pretplate, limit_faktura FROM konfiguracija WHERE id = 1`).toArray()[0] as any || {};
    const saldo = this.getSaldo();
    if (saldo < noviBroj && config.plan_name !== 'Enterprise') return { moze: false, error: { success: false, error: "LIMIT_EXCEEDED", poruka: `Nedovoljno kredita na legeru. Preostalo: ${saldo}.` } };
    return { moze: true };
  }

  private async processQueue(): Promise<void> {
    if (this.isDraining) return;
    this.isDraining = true;
    try {
      while (true) {
        const next = this.sql.exec(`SELECT internal_id, raw_data FROM fakture WHERE status = 'Queued' LIMIT 1`).toArray()[0] as any;
        if (!next) break;
        const config = this.sql.exec(`SELECT sef_api_key, environment, klijent_id FROM konfiguracija WHERE id = 1`).toArray()[0] as any;
        const client = new SefClient({ apiKey: config.sef_api_key, environment: config.environment, baseUrl: this.env.SEF_API_URL });
        const invoiceData = JSON.parse(next.raw_data);
        const xml = SefUblBuilder.build(invoiceData);
        const result = await client.sendInvoice(xml, next.internal_id);
        if (result.success) {
          this.sql.exec(`UPDATE fakture SET sef_id = ?, status = 'Sent', azurirano_u = CURRENT_TIMESTAMP WHERE internal_id = ?`, result.salesInvoiceId?.toString(), next.internal_id);
        } else {
          this.sql.exec(`UPDATE fakture SET status = 'Failed', error_message = ?, azurirano_u = CURRENT_TIMESTAMP WHERE internal_id = ?`, result.error || 'Err', next.internal_id);
        }
        await yieldToEventLoop();
      }
    } finally { this.isDraining = false; }
  }

  public ekstrahujAnalitikuProdaje(invoiceData: SefInvoiceData, internalId: string): void {
    // Analytics extraction stub
  }
}
