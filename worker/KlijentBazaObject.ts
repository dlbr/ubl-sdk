import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";
import { type SefInvoiceData, SefInvoiceSchema } from "../shared/types/sef";
import { SefUblBuilder } from "../packages/sef-ubl-builder/src/index";
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
  }

  private initDatabase(): void {
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS konfiguracija (id INTEGER PRIMARY KEY CHECK (id = 1), sef_api_key TEXT NOT NULL, klijent_id TEXT, environment TEXT DEFAULT 'sandbox');`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS fakture (
          id TEXT PRIMARY KEY, 
          invoice_number TEXT NOT NULL, 
          pib_kupca TEXT, 
          datum_izdavanja TEXT, 
          ukupno_iznos REAL, 
          status TEXT, 
          arhiva_r2_path TEXT, 
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS sef_purchase_invoices (sef_id TEXT PRIMARY KEY, invoice_number TEXT NOT NULL, supplier_pib TEXT NOT NULL, issue_date TEXT NOT NULL, total_amount REAL NOT NULL, status TEXT NOT NULL, raw_xml TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);`);
    });
  }

  async syncWithSef() {
    let config = this.sql.exec(`SELECT sef_api_key, environment, klijent_id FROM konfiguracija WHERE id = 1`).toArray()[0] as any;
    if (!config) throw new Error("Firma nije konfigurisana.");

    const sefClient = new SefClient({ 
      apiKey: config.sef_api_key, 
      environment: config.environment, 
      baseUrl: this.env.SEF_API_URL ?? 'https://demoefaktura.mfin.gov.rs'
    });

    const dateFrom = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const dateTo = new Date().toISOString().split('T')[0];

    console.log(`[DO RPC] Pokrećem Tolerant Discovery za ${config.klijent_id || 'unknown'}`);

    let discoveredSales = 0;
    let discoveredPurchases = 0;

    try {
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
                INSERT INTO fakture (id, invoice_number, status, ukupno_iznos)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET status = excluded.status`, 
                id.toString(), details.InvoiceNumber || `DISC-${id}`, details.InvoiceStatus, details.TotalAmount || 0
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
              INSERT INTO sef_purchase_invoices (sef_id, invoice_number, supplier_pib, issue_date, total_amount, status)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(sef_id) DO UPDATE SET status = excluded.status`,
              inv.invoiceId.toString(), 
              inv.documentNumber || 'N/A', 
              inv.supplierPib || '000000000', 
              inv.creationDate || new Date().toISOString(), 
              inv.sumWithVat || inv.totalAmount || 0, 
              inv.status || inv.invoiceStatus
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
    const fakture = this.sql.exec(`SELECT * FROM fakture ORDER BY created_at DESC LIMIT ? OFFSET ?`, limit, offset).toArray();
    const total = this.sql.exec(`SELECT COUNT(*) as count FROM fakture`).one() as { count: number };
    return { 
      success: true, 
      fakture, 
      total: total.count, 
      page, 
      totalPages: Math.ceil(total.count / limit) 
    };
  }

  async setConfig(data: any) {
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`INSERT OR REPLACE INTO konfiguracija (id, sef_api_key, klijent_id, environment) VALUES (1, ?, ?, ?)`, 
        data.sef_api_key || '', data.klijent_id || null, data.environment || 'sandbox');
    });
    return { success: true };
  }

  async getWebhookInstructions() {
    return { success: true, instructions: { sales_url: '...', purchase_url: '...' } };
  }

  async getStats() { return { success: true }; }
  async getLogs() { return { success: true, logs: [] }; }
  async getPppdvSummary(period: string) { return {}; }
  async sendInvoice(invoiceData: any, headers: any) { return { success: true }; }

  private updateSchemaFor2026() {
    try { this.sql.exec(`ALTER TABLE konfiguracija ADD COLUMN poreski_period_tip TEXT DEFAULT 'MONTHLY';`); } catch (e) {}
  }

  private updateSchemaForBillingLedger() {
    try {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS billing_ledger (row_id INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE, faktura_id TEXT, broj_fakture TEXT, tip_transakcije TEXT, iznos_kredita INTEGER, kreiran_u DATETIME DEFAULT CURRENT_TIMESTAMP, beleska TEXT);`);
    } catch (e) {}
  }

  async dumpDatabase(): Promise<{ fakture: any[], purchase: any[] }> {
    const fakture = this.sql.exec(`SELECT * FROM fakture`).toArray();
    const purchase = this.sql.exec(`SELECT * FROM sef_purchase_invoices`).toArray();
    return { fakture, purchase };
  }
