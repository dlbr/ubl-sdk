import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";
import { type SefInvoiceData, SefInvoiceSchema } from "../shared/types/sef";
import { SefUblBuilder, SefLiveValidator } from "@dlbr/ubl-sdk";
import { SefClient } from "../shared/services/sefClient";
import { PopdvSefClient } from "../shared/services/popdvClient";
import { SefExcelBuilder } from "../shared/services/excelBuilder";
import * as v from 'valibot';
import { SefUblParser } from "./ublParser";
import { type PopdvSubmitData } from '../shared/types/popdv';
import { Router, type RouterContext } from './router';
import { ErrorShield } from "../shared/services/errorShield";
import { Redacted } from "../shared/services/redacted";

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
    this.setupRoutes();
  }

  override async fetch(request: Request): Promise<Response> {
    return this.app.fetch(request, this.env, this.ctx as any);
  }

  private setupRoutes() {
    this.app.get('/config', async () => {
      const config = this.sql.exec(`SELECT * FROM konfiguracija WHERE id = 1`).toArray()[0] as any;
      if (!config) return new Response('Not configured', { status: 404 });
      return Response.json(config);
    });

    this.app.post('/config', async ({ req }: RouterContext<Env>) => {
      const data = await req.json() as any;
      this.sql.exec(`INSERT OR REPLACE INTO konfiguracija (id, sef_api_key, klijent_id, environment, limit_faktura) VALUES (1, ?, ?, ?, ?)`, 
        data.sef_api_key || '', data.klijent_id || null, data.environment || 'sandbox', data.limit || 50);
      
      // Initialize credits if first time
      const ledgerCount = this.sql.exec(`SELECT COUNT(*) as c FROM billing_ledger`).one() as { c: number };
      if (ledgerCount.c === 0) {
        this.sql.exec(`INSERT INTO billing_ledger (id, tip_transakcije, iznos_kredita, beleska) VALUES (?, 'DOPUNA', ?, 'Initial')`, 
          crypto.randomUUID(), data.limit || 50);
      }
      return Response.json({ success: true });
    });

    this.app.post('/admin/set-status', async ({ req }: RouterContext<Env>) => {
      const { status } = await req.json() as { status: string };
      this.sql.exec(`UPDATE konfiguracija SET status_pretplate = ? WHERE id = 1`, status);
      return Response.json({ success: true, status });
    });

    this.app.post('/internal/clear-cache', async () => {
      SefLiveValidator.clearCache();
      return Response.json({ success: true });
    });

    this.app.post('/fakture/send', async ({ req }: RouterContext<Env>) => {
      const invoiceData = await req.json() as any;
      const testNow = req.headers.get('X-Test-Now');
      
      const { moze, error } = await this.checkLimit(1, invoiceData, testNow);
      if (!moze) return Response.json(error, { status: 403 });

      try {
        const xml = SefUblBuilder.build(invoiceData);
        const internalId = `INV-${Date.now()}`;
        
        this.ctx.storage.transactionSync(() => {
          this.sql.exec(`INSERT INTO fakture (internal_id, broj_fakture, status, iznos) VALUES (?, ?, ?, ?)`, 
            internalId, invoiceData.ID || invoiceData.broj, 'Queued', invoiceData.LegalMonetaryTotal?.PayableAmount || invoiceData.osnovica || 0);
          
          // REZERVIŠI KREDIT
          this.sql.exec(`INSERT INTO billing_ledger (id, faktura_id, broj_fakture, tip_transakcije, iznos_kredita, beleska) VALUES (?, ?, ?, 'POTROŠNJA', -1, 'Invoice Send')`, 
            crypto.randomUUID(), internalId, invoiceData.ID || invoiceData.broj);
        });

        return Response.json({ success: true, internalId }, { status: 202 });
      } catch (e: any) {
        return Response.json({ error: 'COMPLIANCE_ERROR', message: e.message }, { status: 400 });
      }
    });

    this.app.get('/api/analytics/potrosnja', async () => {
      const saldo = this.getSaldo();
      const izvod = this.sql.exec(`SELECT * FROM billing_ledger ORDER BY row_id DESC LIMIT 10`).toArray();
      return Response.json({ saldo, izvod });
    });

    this.app.post('/webhooks/sef-update', async ({ req }: RouterContext<Env>) => {
      const { faktura_id, novi_status } = await req.json() as { faktura_id: string, novi_status: string };
      
      this.ctx.storage.transactionSync(() => {
        // Find internal invoice
        const f = this.sql.exec(`SELECT internal_id, broj_fakture, status FROM fakture WHERE sef_id = ? OR internal_id = ? OR broj_fakture = ?`, 
          faktura_id, faktura_id, faktura_id).toArray()[0] as any;
        
        if (f) {
          if (novi_status === 'Rejected' && f.status !== 'Rejected') {
            // Check if already refunded
            const alreadyRefunded = this.sql.exec(`SELECT COUNT(*) as c FROM billing_ledger WHERE faktura_id = ? AND tip_transakcije = 'REFUNDACIJA'`, f.internal_id).one() as { c: number };
            if (alreadyRefunded.c === 0) {
              this.sql.exec(`INSERT INTO billing_ledger (id, faktura_id, broj_fakture, tip_transakcije, iznos_kredita, beleska) VALUES (?, ?, ?, 'REFUNDACIJA', 1, 'SEF Rejected')`, 
                crypto.randomUUID(), f.internal_id, f.broj_fakture);
            }
          }
          this.sql.exec(`UPDATE fakture SET status = ? WHERE internal_id = ?`, novi_status, f.internal_id);
        }
      });
      
      return Response.json({ success: true });
    });
  }

  private async checkLimit(noviBroj: number, invoiceData?: any, testNow?: string | null): Promise<{ moze: boolean, error?: any }> {
    const config = this.sql.exec(`SELECT status_pretplate, plan_name FROM konfiguracija WHERE id = 1`).toArray()[0] as any || {};
    
    if (config.status_pretplate === 'BLOKIRAN') {
      let zakonskiRok = 10;
      try {
        const kvRules = await this.env.PORESKI_KV.get("DRZAVNA_PORESKA_PRAVILA_RS", "json") as any;
        if (kvRules?.ZAKONSKI_ROK_DANA) zakonskiRok = kvRules.ZAKONSKI_ROK_DANA;
      } catch (e) {}

      const danas = testNow ? new Date(testNow) : new Date();
      const datumIzdavanja = invoiceData?.datumIzdavanja || invoiceData?.IssueDate;
      
      if (danas.getDate() <= zakonskiRok && datumIzdavanja) {
        const datumF = new Date(datumIzdavanja);
        if (datumF.getMonth() === danas.getMonth() - 1 && datumF.getFullYear() === danas.getFullYear()) {
          return { moze: true };
        }
      }
      return { moze: false, error: { error: "Pristup blokiran", message: `Licenca istekla. Prošao rok od ${zakonskiRok} dana.` } };
    }

    if (config.plan_name !== 'Enterprise') {
      const saldo = this.getSaldo();
      if (saldo < noviBroj) {
        return { moze: false, error: { error: "LIMIT_EXCEEDED", message: "Nedovoljno kredita." } };
      }
    }

    return { moze: true };
  }

  private initDatabase(): void {
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS konfiguracija (id INTEGER PRIMARY KEY CHECK (id = 1), sef_api_key TEXT NOT NULL, klijent_id TEXT, environment TEXT DEFAULT 'sandbox', status_pretplate TEXT DEFAULT 'AKTIVAN', plan_name TEXT DEFAULT 'Micro', limit_faktura INTEGER DEFAULT 50);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS fakture (
          internal_id TEXT PRIMARY KEY, 
          sef_id TEXT UNIQUE,
          broj_fakture TEXT NOT NULL, 
          status TEXT NOT NULL, 
          iznos REAL NOT NULL DEFAULT 0,
          raw_data TEXT,
          arhiva_r2_path TEXT, 
          kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP,
          azurirano_u DATETIME DEFAULT CURRENT_TIMESTAMP
      );`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS sef_purchase_invoices (sef_id TEXT PRIMARY KEY, invoice_number TEXT NOT NULL, supplier_pib TEXT NOT NULL, issue_date TEXT NOT NULL, total_amount REAL NOT NULL, status TEXT NOT NULL, raw_xml TEXT, arhiva_r2_path TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS billing_ledger (row_id INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE, faktura_id TEXT, broj_fakture TEXT, tip_transakcije TEXT, iznos_kredita INTEGER, kreiran_u DATETIME DEFAULT CURRENT_TIMESTAMP, beleska TEXT);`);
    });
  }

  async syncWithSef() {
    let config = this.sql.exec(`SELECT sef_api_key, environment, klijent_id FROM konfiguracija WHERE id = 1`).toArray()[0] as any;
    if (!config) throw new Error("Firma nije konfigurisana.");

    const sefClient = new SefClient({ 
      apiKey: new Redacted(config.sef_api_key).get(), 
      environment: config.environment, 
      baseUrl: this.env.SEF_API_URL ?? 'https://demoefaktura.mfin.gov.rs' 
    });
    const dateFrom = (new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]) ?? '';
    const dateTo = (new Date().toISOString().split('T')[0]) ?? '';
    
    let discoveredSales = 0;
    let discoveredPurchases = 0;

    try {
      const rawIds = await sefClient.getSalesInvoiceIds(dateFrom, dateTo);
      const invoiceIds = Array.isArray(rawIds) ? rawIds : ((rawIds as any).salesInvoiceIds || []);

      if (invoiceIds.length > 0) {
        for (const id of invoiceIds.slice(-10)) {
          const details = await sefClient.getSalesInvoiceDetails(id);
          if (details) {
            this.ctx.storage.transactionSync(() => {
              this.sql.exec(`
                INSERT INTO fakture (internal_id, sef_id, broj_fakture, status, iznos, azurirano_u)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(sef_id) DO UPDATE SET status = excluded.status, azurirano_u = CURRENT_TIMESTAMP`, 
                `DISC-${id}`, String(id), String(details.InvoiceNumber || id), String(details.InvoiceStatus || 'Unknown'), details.TotalAmount || 0
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
              INSERT INTO sef_purchase_invoices (sef_id, invoice_number, supplier_pib, issue_date, total_amount, status, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(sef_id) DO UPDATE SET status = excluded.status, updated_at = CURRENT_TIMESTAMP`,
              String(inv.invoiceId || 0), String(inv.documentNumber || 'N/A'), String(inv.supplierPib || '000000000'), String(inv.creationDate || new Date().toISOString()), inv.sumWithVat || inv.totalAmount || 0, String(inv.status || inv.invoiceStatus || 'Unknown')
            );
            discoveredPurchases++;
          }
        });
      }
    } catch (e: any) {
      console.error(`[DO] Discovery Error: ${e.message}`);
    }

    return { success: true, message: `Otkriveno: ${discoveredSales} izlaznih i ${discoveredPurchases} ulaznih.` };
  }

  async getFakture(page: number = 1) {
    const limit = 20;
    const offset = (page - 1) * limit;
    const fakture = this.sql.exec(`SELECT * FROM fakture ORDER BY azurirano_u DESC LIMIT ? OFFSET ?`, limit, offset).toArray();
    const total = this.sql.exec(`SELECT COUNT(*) as count FROM fakture`).one() as { count: number };
    return { success: true, fakture, total: total.count, page, totalPages: Math.ceil(total.count / limit) };
  }

  async setConfig(data: any) {
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`INSERT OR REPLACE INTO konfiguracija (id, sef_api_key, klijent_id, environment, limit_faktura) VALUES (1, ?, ?, ?, ?)`, 
        data.sef_api_key || '', data.klijent_id || null, data.environment || 'sandbox', data.limit || 50);
    });
    return { success: true };
  }

  async getWebhookInstructions() { return { success: true, instructions: { sales_url: '...', purchase_url: '...' } }; }
  async getStats() { return { success: true }; }
  async getLogs() { return { success: true, logs: [] }; }
  
  async getPppdvSummary(period: string): Promise<PppdvSummary> {
    const s = this.sql.exec(`SELECT SUM(CASE WHEN t.tax_category_code IN ('S20', 'AE20', 'S', 'AE') AND t.tax_percentage >= 20.0 THEN t.taxable_amount ELSE 0 END) as bOpsta, SUM(CASE WHEN t.tax_category_code IN ('S20', 'AE20', 'S', 'AE') AND t.tax_percentage >= 20.0 THEN t.tax_amount ELSE 0 END) as pOpsta, SUM(CASE WHEN t.tax_category_code IN ('S10', 'AE10', 'S', 'AE') AND t.tax_percentage < 20.0 AND t.tax_percentage > 0 THEN t.taxable_amount ELSE 0 END) as bPosebna, SUM(CASE WHEN t.tax_category_code IN ('S10', 'AE10', 'S', 'AE') AND t.tax_percentage < 20.0 AND t.tax_percentage > 0 THEN t.tax_amount ELSE 0 END) as pPosebna, SUM(CASE WHEN t.tax_category_code IN ('E', 'Z', 'AE', 'AE20', 'AE10') THEN t.taxable_amount ELSE 0 END) as oslobodjen_sa, SUM(CASE WHEN t.tax_category_code IN ('OE', 'R', 'G') THEN t.taxable_amount ELSE 0 END) as oslobodjen_bez FROM sef_sales_invoice_taxes t JOIN fakture f ON t.invoice_id = f.internal_id WHERE f.status IN ('Sent', 'Approved') AND f.azurirano_u LIKE ?`, `${period}%`).toArray()[0] as any;
    const p = this.sql.exec(`SELECT SUM(CASE WHEN i.supplier_pib = '000000000' THEN t.taxable_amount ELSE 0 END) as uvoz_b, SUM(CASE WHEN i.supplier_pib = '000000000' THEN t.tax_amount ELSE 0 END) as uvoz_p, SUM(CASE WHEN t.tax_category_code IN ('AE', 'AE20', 'AE10') THEN t.taxable_amount ELSE 0 END) as interni_b, SUM(CASE WHEN t.tax_category_code IN ('AE', 'AE20', 'AE10') THEN t.tax_amount ELSE 0 END) as interni_p, SUM(t.tax_amount - t.non_deductible_amount) as cist FROM sef_purchase_invoice_taxes t JOIN sef_purchase_invoices i ON t.invoice_id = i.sef_id WHERE i.status = 'Approved' AND i.issue_date LIKE ?`, `${period}%`).toArray()[0] as any;
    const p101 = Math.round(s?.pOpsta || 0), p102 = Math.round(s?.pPosebna || 0), p106 = Math.round(p?.interni_p || 0), p108 = Math.round(p?.cist || 0), p105 = Math.round(p?.uvoz_p || 0);
    return { period, pozicija001_osnovicaOpsta: Math.round(s?.bOpsta || 0), pozicija101_pdvOpsta: p101, pozicija002_osnovicaPosebna: Math.round(s?.bPosebna || 0), pozicija102_pdvPosebna: p102, pozicija003_oslobodjenSaPravom: Math.round(s?.oslobodjen_sa || 0), pozicija004_oslobodjenBezPrava: Math.round(s?.oslobodjen_bez || 0), pozicija005_uvozOsnovica: Math.round(p?.uvoz_b || 0), pozicija105_uvozPdv: p105, pozicija006_interniObracunOsnovica: Math.round(p?.interni_b || 0), pozicija106_interniObracunPdv: p106, pozicija008_prethodniPorezOdbitni: p108, porezZaUplatuIliPovracaj: (p101 + p102 + p106) - p108 };
  }

  async sendInvoice(invoiceData: any, headers: any) { return { success: true }; }

  private updateSchemaFor2026() {
    try { this.sql.exec(`ALTER TABLE konfiguracija ADD COLUMN poreski_period_tip TEXT DEFAULT 'MONTHLY';`); } catch (e) {}
  }

  private updateSchemaForBillingLedger() {
    try {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS billing_ledger (row_id INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE, faktura_id TEXT, broj_fakture TEXT, tip_transakcije TEXT, iznos_kredita INTEGER, kreiran_u DATETIME DEFAULT CURRENT_TIMESTAMP, beleska TEXT);`);
    } catch (e) {}
  }

  private getSaldo(): number {
    const row = this.sql.exec(`SELECT SUM(iznos_kredita) as ukupno FROM billing_ledger`).one() as { ukupno: number | null };
    return row.ukupno || 0;
  }

  async dumpDatabase(): Promise<{ fakture: any[], purchase: any[] }> {
    const fakture = this.sql.exec(`SELECT * FROM fakture`).toArray();
    const purchase = this.sql.exec(`SELECT * FROM sef_purchase_invoices`).toArray();
    return { fakture, purchase };
  }
}
