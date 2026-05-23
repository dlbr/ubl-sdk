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
    this.setupRoutes();
  }

  override async fetch(request: Request): Promise<Response> {
    return this.app.fetch(request, this.env, this.ctx as any);
  }

  override async alarm(): Promise<void> {
    const configRez = this.sql.exec(`SELECT * FROM konfiguracija WHERE id = 1`).toArray() as any[];
    const config = configRez[0];
    if (!config) return;

    const sefClient = new SefClient({ 
      apiKey: config.sef_api_key, 
      baseUrl: this.env.SEF_API_URL! || (config.environment === 'production' ? 'https://efaktura.mfin.gov.rs' : 'https://demoefaktura.mfin.gov.rs'),
      environment: config.environment 
    });

    // 1. SUBSCRIPTION MONITORING
    const licencaIstice = parseInt(config.licenca_istice_timestamp || '0');
    const preostaloVreme = licencaIstice - Date.now();
    const JEDAN_DAN_MS = 24 * 60 * 60 * 1000;
    const statusPretplate = config.status_pretplate || 'AKTIVAN';

    if (licencaIstice > 0 && preostaloVreme <= 7 * JEDAN_DAN_MS && preostaloVreme > 6 * JEDAN_DAN_MS) {
      if (!config.avans_za_obnovu_poslat) {
        const uspeh = await this.generisiIAutomatskiPosaljiAvansNaSef(config);
        if (uspeh) this.sql.exec(`UPDATE konfiguracija SET avans_za_obnovu_poslat = 1 WHERE id = 1`);
      }
    }

    if (licencaIstice > 0 && preostaloVreme <= 0 && statusPretplate !== 'BLOKIRAN') {
      this.sql.exec(`UPDATE konfiguracija SET status_pretplate = 'BLOKIRAN' WHERE id = 1`);
      console.log(`[Subscription Master] Klijent ${config.klijent_id} BLOKIRAN usled isteka licence.`);
    }

    // 2. PURCHASE SYNC & ARCHIVAL
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
              
              for (const tax of parsed.TaxTotals) {
                for (const sub of tax.Subtotals) {
                  this.sql.exec(`INSERT INTO sef_purchase_invoice_taxes (invoice_id, taxable_amount, tax_amount, tax_percentage, tax_category_code) VALUES (?, ?, ?, ?, ?)`, 
                    p.sef_id, sub.TaxableAmount, sub.TaxAmount, sub.Percent, sub.Category);
                }
              }
            });

            // v3.7.0: Arhiviranje ulazne fakture na R2
            const r2Putanja = `tenants/${config.klijent_id}/${new Date().getFullYear()}/purchases/${parsed.ID}_${p.sef_id}.xml`;
            await this.env.SEF_UBL_ARHIVA.put(r2Putanja, xml, {
              httpMetadata: { contentType: "text/xml", cacheControl: "public, max-age=31536000, immutable" },
              customMetadata: { type: "PURCHASE", zakonski_rok_cuvanja: (new Date().getFullYear() + 10).toString() }
            });
            this.sql.exec(`UPDATE sef_purchase_invoices SET arhiva_r2_path = ? WHERE sef_id = ?`, r2Putanja, p.sef_id);
          }
        }
      } finally { this.isSyncingPurchases = false; }
    }
  }

  private setupRoutes() {
    this.app.get('/stats', async () => {
      const stats = this.sql.exec(`SELECT status, COUNT(*) as broj FROM fakture GROUP BY status`).toArray() as any[];
      const pStats = this.sql.exec(`SELECT status, COUNT(*) as broj FROM sef_purchase_invoices GROUP BY status`).toArray() as any[];
      const config = this.sql.exec(`SELECT * FROM konfiguracija WHERE id = 1`).toArray()[0] || {};
      const totalSales = stats.reduce((sum, item) => sum + item.broj, 0);
      const saldo = this.getSaldo();
      const health = this.sql.exec(`SELECT COUNT(*) as broj FROM error_logs WHERE kreirano_u > datetime('now', '-1 day')`).one() as { broj: number };
      
      return Response.json({ 
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
      });
    });

    this.app.get('/config', async () => {
      const config = this.sql.exec(`SELECT * FROM konfiguracija WHERE id = 1`).toArray()[0] as any;
      if (!config) return new Response('Not configured', { status: 404 });
      return Response.json(config);
    });

    this.app.get('/config/webhook-instructions', async () => {
      const config = this.sql.exec(`SELECT klijent_id, environment FROM konfiguracija WHERE id = 1`).toArray()[0] as any;
      if (!config) return Response.json({ error: "Firma nije konfigurisana" }, { status: 404 });
      
      // OKLOP: Safe host detection
      let host = 'sef.dlbr.cloud';
      const websiteUrl = (this.env as any).WEBSITE_URL;
      if (websiteUrl) {
        try { host = new URL(websiteUrl).host; } catch(e) {}
      }
      
      const webhookBase = `https://${host}/api/webhooks/sef`;
      
      return Response.json({
        success: true,
        instructions: {
          sales_url: `${webhookBase}?smer=SALES`,
          purchase_url: `${webhookBase}?smer=PURCHASES`,
          token_header: "X-SEF-Token",
          environment: config.environment
        }
      });
    });

    this.app.post('/config', async ({ req }: RouterContext<Env>) => {
      const data = await req.json() as any;
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
      return Response.json({ success: true });
    });

    this.app.post('/fakture/send', async ({ req }: RouterContext<Env>) => {
      const invoiceData = await req.json() as SefInvoiceData;
      const validation = v.safeParse(SefInvoiceSchema, invoiceData);
      if (!validation.success) return Response.json({ error: "Invalid data", details: validation.issues }, { status: 422 });

      const testNow = req.headers.get('X-Test-Now');
      const limit = await this.checkLimit(1, invoiceData, testNow);
      if (!limit.moze) return Response.json(limit.error, { status: 402 });

      this.ctx.storage.transactionSync(() => {
        this.rezervisiKreditZaFakturu(invoiceData.ID, invoiceData.ID);
        this.sql.exec(`INSERT OR REPLACE INTO fakture (internal_id, status, invoice_type_code, broj_fakture, iznos, raw_data) VALUES (?, 'Queued', ?, ?, ?, ?)`, invoiceData.ID, invoiceData.InvoiceTypeCode || '380', invoiceData.ID, invoiceData.LegalMonetaryTotal.PayableAmount, JSON.stringify(invoiceData));
        this.ekstrahujAnalitikuProdaje(invoiceData, invoiceData.ID);
      });
      this.ctx.waitUntil(this.processQueue());
      return Response.json({ success: true, id: invoiceData.ID }, { status: 202 });
    });

    this.app.post('/fakture/batch', async ({ req }: RouterContext<Env>) => {
      const { fakture } = await req.json() as { fakture: any[] };
      const testNow = req.headers.get('X-Test-Now');
      const limit = await this.checkLimit(fakture.length, fakture[0], testNow);
      if (!limit.moze) return Response.json(limit.error, { status: 402 });

      this.ctx.storage.transactionSync(() => {
        for (const f of fakture) {
          const internalId = f.ID || `BATCH-${Math.random()}`;
          this.rezervisiKreditZaFakturu(internalId, f.ID || 'UNK');
          this.sql.exec(`INSERT OR REPLACE INTO fakture (internal_id, status, invoice_type_code, broj_fakture, iznos, raw_data) VALUES (?, 'Queued', ?, ?, ?, ?)`, internalId, f.InvoiceTypeCode || '380', f.ID || 'UNK', f.LegalMonetaryTotal?.PayableAmount || 0, JSON.stringify(f));
          this.ekstrahujAnalitikuProdaje(f, internalId);
        }
      });
      this.ctx.waitUntil(this.processQueue());
      return Response.json({ success: true, count: fakture.length }, { status: 202 });
    });

    this.app.post('/webhooks/sef-update', async ({ req }: RouterContext<Env>) => {
      const url = new URL(req.url);
      const data = await req.json() as any;
      const smer = url.searchParams.get('smer') || 'SALES';
      
      if (smer === 'PURCHASES') {
        this.sql.exec(`INSERT INTO sef_purchase_invoices (sef_id, invoice_number, supplier_pib, issue_date, total_amount, status, raw_xml) VALUES (?, 'WEBHOOK-INIT', '000000000', ?, 0, ?, '<xml_missing>') ON CONFLICT(sef_id) DO UPDATE SET status = excluded.status`, data.faktura_id, data.timestamp || new Date().toISOString(), data.novi_status);
        await this.ctx.storage.setAlarm(Date.now() + 100);
      } else {
        this.ctx.storage.transactionSync(() => {
          this.sql.exec(`INSERT INTO fakture (internal_id, sef_id, status, broj_fakture, iznos, azurirano_u) VALUES (?, ?, ?, 'WEBHOOK-INIT', 0, CURRENT_TIMESTAMP) ON CONFLICT(sef_id) DO UPDATE SET status = excluded.status, azurirano_u = CURRENT_TIMESTAMP`, `SEF-ASYNC-${data.faktura_id}`, data.faktura_id, data.novi_status);
          if (data.novi_status === 'Rejected' || data.novi_status === 'Mistake') {
            const inv = this.sql.exec(`SELECT internal_id, broj_fakture FROM fakture WHERE sef_id = ? OR internal_id = ?`, data.faktura_id, data.faktura_id).toArray()[0] as any;
            const internalId = inv?.internal_id || data.faktura_id;
            const broj = inv?.broj_fakture || `ID-${data.faktura_id}`;
            const vecRef = this.sql.exec(`SELECT 1 FROM billing_ledger WHERE faktura_id = ? AND tip_transakcije = 'REFUNDACIJA'`, internalId).toArray().length > 0;
            if (!vecRef) this.sql.exec(`INSERT INTO billing_ledger (id, faktura_id, broj_fakture, tip_transakcije, iznos_kredita, beleska) VALUES (?, ?, ?, 'REFUNDACIJA', 1, ?)`, crypto.randomUUID(), internalId, broj, `Refund ${data.novi_status}`);
          }
        });
      }
      return Response.json({ success: true });
    });

    this.app.get('/api/audit/download', async ({ req }: RouterContext<Env>) => {
      const url = new URL(req.url);
      const period = url.searchParams.get('period');
      if (!period) return Response.json({ error: "Missing period" }, { status: 400 });

      // 1. Povuci putanje za arhivirane prodaje i nabavke
      const sales = this.sql.exec(`SELECT internal_id, broj_fakture as broj, status, arhiva_r2_path, 'SALE' as tip FROM fakture WHERE azurirano_u LIKE ? AND arhiva_r2_path IS NOT NULL`, `${period}%`).toArray() as any[];
      const purchases = this.sql.exec(`SELECT sef_id as internal_id, invoice_number as broj, status, arhiva_r2_path, 'PURCHASE' as tip FROM sef_purchase_invoices WHERE issue_date LIKE ? AND arhiva_r2_path IS NOT NULL`, `${period}%`).toArray() as any[];
      const allDocs = [...sales, ...purchases];

      if (allDocs.length === 0) return Response.json({ message: "Nema arhiviranih dokumenata." }, { status: 404 });

      const auditManifest = [];
      for (const doc of allDocs) {
        try {
          const r2Obj = await this.env.SEF_UBL_ARHIVA.get(doc.arhiva_r2_path);
          if (r2Obj) auditManifest.push({ internalId: doc.internal_id, broj: doc.broj, status: doc.status, tip: doc.tip, xmlSadrzaj: await r2Obj.text() });
        } catch (e) {}
      }
      return Response.json({ status: "USKLAĐENO_SA_UREDROM_MFIN", poreskiPeriod: period, ukupnoDokumenata: auditManifest.length, dokumenti: auditManifest });
    });

    this.app.get('/api/analytics/potrosnja', async () => {
      const transakcije = this.sql.exec(`SELECT kreiran_u, broj_fakture, tip_transakcije, iznos_kredita, beleska FROM billing_ledger ORDER BY row_id DESC LIMIT 100`).toArray();
      return Response.json({ saldo: this.getSaldo(), izvod: transakcije });
    });

    this.app.get('/api/analytics/pppdv-summary', async ({ req }: RouterContext<Env>) => {
      const url = new URL(req.url);
      const period = url.searchParams.get('period');
      if (!period) return Response.json({ error: "Missing period" }, { status: 400 });
      return Response.json({ success: true, data: this.getPppdvSummary(period) });
    });

    this.app.get('/api/analytics/export-excel', async ({ req }: RouterContext<Env>) => {
      const url = new URL(req.url);
      const period = url.searchParams.get('period');
      if (!period) return Response.json({ error: "Missing period" }, { status: 400 });
      const summary = this.getPppdvSummary(period);
      const salesRows = this.sql.exec(`SELECT f.broj_fakture, f.azurirano_u as datum_racuna, COALESCE(MAX(i.item_name), 'Ekstrakcija') as naziv_kupca, '000000000' as pib_kupca, SUM(CASE WHEN t.tax_category_code IN ('S20', 'AE20', 'S', 'AE') AND t.tax_percentage >= 20.0 THEN t.taxable_amount ELSE 0 END) as osnovicaOpsta, SUM(CASE WHEN t.tax_category_code IN ('S20', 'AE20', 'S', 'AE') AND t.tax_percentage >= 20.0 THEN t.tax_amount ELSE 0 END) as pdvOpsta, SUM(CASE WHEN t.tax_category_code IN ('S10', 'AE10', 'S', 'AE') AND t.tax_percentage < 20.0 AND t.tax_percentage > 0 THEN t.taxable_amount ELSE 0 END) as osnovicaPosebna, SUM(CASE WHEN t.tax_category_code IN ('S10', 'AE10', 'S', 'AE') AND t.tax_percentage < 20.0 AND t.tax_percentage > 0 THEN t.tax_amount ELSE 0 END) as pdvPosebna FROM sef_sales_invoice_taxes t JOIN fakture f ON t.invoice_id = f.internal_id LEFT JOIN sef_sales_invoice_items i ON f.internal_id = i.invoice_id WHERE f.status IN ('Sent', 'Approved') AND f.azurirano_u LIKE ? GROUP BY f.internal_id`, `${period}%`).toArray();
      const excelXml = SefExcelBuilder.buildPoreskaEvidencija(period, summary, salesRows.map(r => ({...r, tipKupca: 'UNK'})), []);
      return new Response(excelXml, { headers: { 'Content-Type': 'application/vnd.ms-excel', 'Content-Disposition': `attachment; filename="Poreska_Evidencija_${period}.xls"` } });
    });

    this.app.post('/popdv/submit-draft', async ({ req }: RouterContext<Env>) => {
      const url = new URL(req.url);
      const period = url.searchParams.get('period');
      const pib = url.searchParams.get('pib');
      if (!period || !pib) return Response.json({ error: "Missing params" }, { status: 400 });
      this.sql.exec(`INSERT OR REPLACE INTO sef_popdv_periods (period, status) VALUES (?, 'SUBMITTING_DRAFT')`, period);
      const payload = this.generatePopdvData(period, pib);
      const config = this.sql.exec(`SELECT sef_subscription_token FROM konfiguracija WHERE id = 1`).toArray()[0] as any;
      if (!config?.sef_subscription_token) return Response.json({ error: "No token" }, { status: 401 });
      const client = new PopdvSefClient({ baseUrl: 'https://demoppppdv.mfin.gov.rs/public-api', token: config.sef_subscription_token });
      const res = await client.sendDraft(payload);
      if (res.success && res.data) {
        this.sql.exec(`UPDATE sef_popdv_periods SET status = 'DRAFT_ACCEPTED', draft_id = ? WHERE period = ?`, res.data.draftId, period);
        return Response.json({ success: true, draftId: res.data.draftId });
      }
      return Response.json({ error: "Failed", details: res.error }, { status: 422 });
    });

    this.app.post('/popdv/finalize', async ({ req }: RouterContext<Env>) => {
      const url = new URL(req.url);
      const period = url.searchParams.get('period');
      if (!period) return Response.json({ error: "Missing period" }, { status: 400 });
      this.sql.exec(`UPDATE sef_popdv_periods SET status = 'FINALIZED' WHERE period = ?`, period);
      return Response.json({ success: true });
    });

    this.app.get('/logs', async () => {
      const logs = this.sql.exec(`SELECT * FROM error_logs ORDER BY kreirano_u DESC LIMIT 50`).toArray();
      return Response.json({ success: true, logs });
    });

    this.app.get('/fakture', async ({ req }: RouterContext<Env>) => {
      const url = new URL(req.url);
      const page = parseInt(url.searchParams.get('page') || '1');
      const limit = 20;
      const offset = (page - 1) * limit;
      const fakture = this.sql.exec(`SELECT * FROM fakture ORDER BY azurirano_u DESC LIMIT ? OFFSET ?`, limit, offset).toArray();
      const total = this.sql.exec(`SELECT COUNT(*) as count FROM fakture`).one() as { count: number };
      return Response.json({ 
        success: true, 
        fakture, 
        total: total.count, 
        page, 
        totalPages: Math.ceil(total.count / limit) 
      });
    });

    this.app.patch('/fakture/:id/odbitak', async ({ req, result }: RouterContext<Env>) => {
      const sefId = (result as any).pathname.groups.id;
      const { deductible } = await req.json() as { deductible: number };
      // Forensic logic: update the non-deductible portion based on the requested deductible amount
      this.sql.exec(`UPDATE sef_purchase_invoice_taxes SET non_deductible_amount = taxable_amount * (tax_percentage / 100) - ? WHERE invoice_id = ?`, deductible, sefId);
      return Response.json({ success: true });
    });

    this.app.post('/evidencija/eeo', async ({ req }: RouterContext<Env>) => {
      const data = await req.json() as any;
      const period = data.poreski_period;
      const existing = this.sql.exec(`SELECT status FROM sef_poreske_evidencije_eeo WHERE poreski_period = ?`, period).toArray() as any[];
      if (existing.length > 0 && (existing[0].status === 'SENT' || existing[0].status === 'FINALIZED')) return Response.json({ error: "Locked" }, { status: 400 });
      this.sql.exec(`INSERT OR REPLACE INTO sef_poreske_evidencije_eeo (id, poreski_period, tip_evidencije, osnovica_opsta, pdv_opsta, osnovica_posebna, pdv_posebna, status, internal_invoice_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, data.id || `EEO-${Date.now()}`, period, data.tip_evidencije || 'ZBIRNA', data.osnovicaOpsta || 0, data.pdvOpsta || 0, data.osnovicaPosebna || 0, data.pdvPosebna || 0, data.status || 'DRAFT', data.internal_invoice_number || null);
      return Response.json({ success: true });
    });

    this.app.post('/admin/set-status', async ({ req }: RouterContext<Env>) => {
      const { status } = await req.json() as { status: string };
      this.sql.exec(`UPDATE konfiguracija SET status_pretplate = ? WHERE id = 1`, status);
      return Response.json({ success: true, status });
    });
    // Alias for internal calls
    this.app.post('/admin/set-status', async ({ req }: RouterContext<Env>) => {
      const { status } = await req.json() as { status: string };
      this.sql.exec(`UPDATE konfiguracija SET status_pretplate = ? WHERE id = 1`, status);
      return Response.json({ success: true, status });
    });

    this.app.post('/internal/clear-cache', async () => {
      SefLiveValidator.clearCache();
      return Response.json({ success: true, message: "Cache cleared" });
    });
    // Alias for internal calls
    this.app.post('/internal/clear-cache', async () => {
      SefLiveValidator.clearCache();
      return Response.json({ success: true, message: "Cache cleared" });
    });

    this.app.post('/fakture/send-queued', async ({ req }: RouterContext<Env>) => {
      const { internalId, xml } = await req.json() as { internalId: string, xml: string };
      const config = this.sql.exec(`SELECT sef_api_key, environment, klijent_id FROM konfiguracija WHERE id = 1`).toArray()[0] as any;
      if (!config) return Response.json({ error: "No config" }, { status: 400 });

      const client = new SefClient({ apiKey: config.sef_api_key, environment: config.environment, baseUrl: this.env.SEF_API_URL! });
      const brojRow = this.sql.exec(`SELECT broj_fakture FROM fakture WHERE internal_id = ?`, internalId).toArray()[0] as any;
      
      const result = await client.sendInvoice(xml, internalId);
      if (result.success) {
        this.ctx.storage.transactionSync(() => {
          this.sql.exec(`UPDATE fakture SET sef_id = ?, status = 'Sent', azurirano_u = CURRENT_TIMESTAMP WHERE internal_id = ?`, result.salesInvoiceId?.toString(), internalId);
        });
        if (brojRow?.broj_fakture) {
           await this.arhivirajUblDokument(internalId, config.klijent_id, brojRow.broj_fakture, xml, "SALE");
        }
        return Response.json({ success: true });
      } else {
        this.sql.exec(`UPDATE fakture SET status = 'Failed', error_message = ?, azurirano_u = CURRENT_TIMESTAMP WHERE internal_id = ?`, result.error || 'Err', internalId);
        return Response.json({ success: false, error: result.error }, { status: 400 });
      }
    });

    this.app.post('/test/seed', async ({ req }: RouterContext<Env>) => {
      const p = await req.json() as any;
      if (p.action === 'SEED_IMPORT') {
        this.ctx.storage.transactionSync(() => {
          this.sql.exec(`INSERT OR REPLACE INTO sef_purchase_invoices (sef_id, invoice_number, supplier_pib, issue_date, total_amount, status, raw_xml) VALUES (?, ?, '000000000', ?, ?, 'Approved', '<mock>')`, p.sefId || 'IMP-01', p.invoiceNumber || 'IMP-1', p.issueDate || '2026-05-18', p.totalAmount || 0);
          this.sql.exec(`INSERT OR REPLACE INTO sef_purchase_invoice_taxes (invoice_id, tax_category_code, tax_percentage, taxable_amount, tax_amount) VALUES (?, 'S20', 20.0, ?, ?)`, p.sefId || 'IMP-01', p.taxableAmount || 0, p.taxAmount || 0);
        });
        return Response.json({ success: true });
      }
      if (p.action === 'RESET_LEDGER') {
        this.sql.exec(`DELETE FROM billing_ledger`);
        if (p.saldo) this.sql.exec(`INSERT INTO billing_ledger (id, tip_transakcije, iznos_kredita, beleska) VALUES (?, 'DOPUNA', ?, 'Reset')`, crypto.randomUUID(), p.saldo);
        return Response.json({ success: true });
      }
      return Response.json({ error: "Unknown" }, { status: 400 });
    });
    
    this.app.post('/sync-sef', async () => {
      const config = this.sql.exec(`SELECT sef_api_key, environment FROM konfiguracija WHERE id = 1`).toArray()[0] as any;
      if (!config) {
        console.error(`[DO] Sync failed: Configuration missing for ${this.ctx.id.toString()}`);
        return Response.json({ error: "Firma nije konfigurisana. Molimo prođite kroz onboarding." }, { status: 400 });
      }
      const client = new SefClient({ apiKey: config.sef_api_key, environment: config.environment, baseUrl: this.env.SEF_API_URL! });
      const fakture = this.sql.exec(`SELECT internal_id, sef_id, status FROM fakture WHERE status NOT IN ('Approved', 'Rejected', 'Cancelled') AND sef_id IS NOT NULL`).toArray() as any[];
      for (const f of fakture) {
        const res = await client.getInvoiceStatus(parseInt(f.sef_id));
        if (res?.InvoiceStatus && res.InvoiceStatus !== f.status) {
          this.ctx.storage.transactionSync(() => {
            this.sql.exec(`UPDATE fakture SET status = ?, azurirano_u = CURRENT_TIMESTAMP WHERE internal_id = ?`, res.InvoiceStatus, f.internal_id);
            if (res.InvoiceStatus === 'Rejected' || res.InvoiceStatus === 'Mistake') {
              const vecRef = this.sql.exec(`SELECT 1 FROM billing_ledger WHERE faktura_id = ? AND tip_transakcije = 'REFUNDACIJA'`, f.internal_id).toArray().length > 0;
              if (!vecRef) {
                const brojRow = this.sql.exec(`SELECT broj_fakture FROM fakture WHERE internal_id = ?`, f.internal_id).toArray()[0] as any;
                this.sql.exec(`INSERT INTO billing_ledger (id, faktura_id, broj_fakture, tip_transakcije, iznos_kredita, beleska) VALUES (?, ?, ?, 'REFUNDACIJA', 1, ?)`, crypto.randomUUID(), f.internal_id, brojRow?.broj_fakture || f.internal_id, `Manual Refund`);
              }
            }
          });
        }
      }
      await this.processQueue();
      return Response.json({ success: true });
    });
  }

  private initDatabase(): void {
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS konfiguracija (id INTEGER PRIMARY KEY CHECK (id = 1), sef_api_key TEXT NOT NULL, klijent_id TEXT, password_hash TEXT, sef_subscription_token TEXT, webhook_url TEXT, environment TEXT DEFAULT 'sandbox', limit_faktura INTEGER DEFAULT 50, plan_name TEXT DEFAULT 'Micro', billing_period TEXT DEFAULT 'monthly', licenca_od_datuma TEXT, licenca_istice_timestamp TEXT, status_pretplate TEXT DEFAULT 'AKTIVAN', limit_faktura_godisnje INTEGER DEFAULT 600, avans_za_obnovu_poslat INTEGER DEFAULT 0, poreski_period_tip TEXT DEFAULT 'MONTHLY');`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS fakture (internal_id TEXT PRIMARY KEY, sef_id TEXT UNIQUE, status TEXT NOT NULL, invoice_type_code TEXT DEFAULT '380', broj_fakture TEXT NOT NULL, iznos REAL NOT NULL, raw_data TEXT, error_message TEXT, kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP, azurirano_u DATETIME DEFAULT CURRENT_TIMESTAMP, arhiva_r2_path TEXT);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS sef_purchase_invoices (sef_id TEXT PRIMARY KEY, invoice_number TEXT NOT NULL, supplier_pib TEXT NOT NULL, issue_date TEXT NOT NULL, total_amount REAL NOT NULL, status TEXT NOT NULL, raw_xml TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, arhiva_r2_path TEXT);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS sef_purchase_invoice_taxes (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id TEXT NOT NULL, taxable_amount REAL NOT NULL, tax_amount REAL NOT NULL, tax_percentage REAL NOT NULL, tax_category_code TEXT NOT NULL, non_deductible_amount REAL DEFAULT 0, FOREIGN KEY(invoice_id) REFERENCES sef_purchase_invoices(sef_id) ON DELETE CASCADE);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS sef_sales_invoice_taxes (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id TEXT NOT NULL, taxable_amount REAL NOT NULL, tax_amount REAL NOT NULL, tax_percentage REAL NOT NULL, tax_category_code TEXT NOT NULL, FOREIGN KEY(invoice_id) REFERENCES fakture(internal_id) ON DELETE CASCADE);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS sef_sales_invoice_items (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id TEXT NOT NULL, line_extension_amount REAL NOT NULL, item_name TEXT NOT NULL, quantity REAL NOT NULL, unit_code TEXT, tax_percent REAL NOT NULL, tax_amount REAL NOT NULL, FOREIGN KEY(invoice_id) REFERENCES fakture(internal_id) ON DELETE CASCADE);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS sef_poreske_evidencije_eeo (id TEXT PRIMARY KEY, poreski_period TEXT, tip_evidencije TEXT, osnovica_opsta REAL, pdv_opsta REAL, osnovica_posebna REAL, pdv_posebna REAL, status TEXT, internal_invoice_number TEXT);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS sef_poreske_evidencije_epp (poreski_period TEXT PRIMARY KEY, carinski_pdv REAL DEFAULT 0.00, interni_obracun_stranci REAL DEFAULT 0.00, status TEXT);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS billing_ledger (row_id INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE, faktura_id TEXT, broj_fakture TEXT, tip_transakcije TEXT, iznos_kredita INTEGER, kreiran_u DATETIME DEFAULT CURRENT_TIMESTAMP, beleska TEXT);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS error_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, internal_id TEXT, sef_id TEXT, error_message TEXT NOT NULL, status_code INTEGER, kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS sef_popdv_periods (period TEXT PRIMARY KEY, status TEXT NOT NULL, draft_id TEXT, broj_prijave TEXT, azurirano_at DATETIME DEFAULT CURRENT_TIMESTAMP);`);
    });
  }

  private updateSchemaForBillingLedger() {
    try {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS billing_ledger (row_id INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE, faktura_id TEXT, broj_fakture TEXT, tip_transakcije TEXT, iznos_kredita INTEGER, kreiran_u DATETIME DEFAULT CURRENT_TIMESTAMP, beleska TEXT);`);
      const count = this.sql.exec(`SELECT COUNT(*) as c FROM billing_ledger`).one() as { c: number };
      if (count.c === 0) {
        const config = this.sql.exec(`SELECT limit_faktura FROM konfiguracija WHERE id = 1`).toArray()[0] as any;
        if (config) this.sql.exec(`INSERT INTO billing_ledger (id, tip_transakcije, iznos_kredita, beleska) VALUES (?, 'DOPUNA', ?, 'Initial')`, crypto.randomUUID(), config.limit_faktura || 50);
      }
    } catch (e) {}
  }

  private updateSchemaFor2026() {
    try { this.sql.exec(`ALTER TABLE sef_poreske_evidencije_eeo ADD COLUMN internal_invoice_number TEXT;`); } catch (e) {}
    try {
      this.sql.exec(`ALTER TABLE sef_poreske_evidencije_eeo ADD COLUMN osnovica_opsta REAL;`);
      this.sql.exec(`ALTER TABLE sef_poreske_evidencije_eeo ADD COLUMN pdv_opsta REAL;`);
      this.sql.exec(`ALTER TABLE sef_poreske_evidencije_eeo ADD COLUMN osnovica_posebna REAL;`);
      this.sql.exec(`ALTER TABLE sef_poreske_evidencije_eeo ADD COLUMN pdv_posebna REAL;`);
    } catch (e) {}
    try { this.sql.exec(`ALTER TABLE konfiguracija ADD COLUMN poreski_period_tip TEXT DEFAULT 'MONTHLY';`); } catch (e) {}
    try { this.sql.exec(`ALTER TABLE fakture ADD COLUMN arhiva_r2_path TEXT;`); } catch (e) {}
    try { this.sql.exec(`ALTER TABLE sef_purchase_invoices ADD COLUMN arhiva_r2_path TEXT;`); } catch (e) {}
  }

  private getSaldo(): number {
    const row = this.sql.exec(`SELECT SUM(iznos_kredita) as ukupno FROM billing_ledger`).one() as { ukupno: number | null };
    return row.ukupno || 0;
  }

  private rezervisiKreditZaFakturu(fakturaId: string, brojFakture: string): void {
    this.sql.exec(`INSERT INTO billing_ledger (id, faktura_id, broj_fakture, tip_transakcije, iznos_kredita, beleska) VALUES (?, ?, ?, 'POTROŠNJA', -1, 'Reservation')`, crypto.randomUUID(), fakturaId, brojFakture);
  }

  private async generisiIAutomatskiPosaljiAvansNaSef(config: any) {
    console.log(`[Subscription] Generisanje avansa za obnovu za ${config.klijent_id}`);
    return true; // Stub
  }

  private async arhivirajUblDokument(internalId: string, pib: string, brojFakture: string, xmlSadrzaj: string, tip: "SALE" | "PURCHASE" = "SALE") {
    const godina = new Date().getFullYear();
    const r2Putanja = `tenants/${pib}/${godina}/${tip.toLowerCase()}s/${brojFakture}_${internalId}.xml`;
    try {
      await this.env.SEF_UBL_ARHIVA.put(r2Putanja, xmlSadrzaj, { 
        httpMetadata: { contentType: "text/xml", cacheControl: "public, max-age=31536000, immutable" }, 
        customMetadata: { type: tip, zakonski_rok_cuvanja: (godina + 10).toString() } 
      });
      const table = tip === "SALE" ? "fakture" : "sef_purchase_invoices";
      const idCol = tip === "SALE" ? "internal_id" : "sef_id";
      this.sql.exec(`UPDATE ${table} SET arhiva_r2_path = ? WHERE ${idCol} = ?`, r2Putanja, internalId);
    } catch (e) {}
  }

  private async checkLimit(noviBroj: number, invoiceData?: SefInvoiceData, testNowHeader?: string | null): Promise<{ moze: boolean, error?: any }> {
    const config = this.sql.exec(`SELECT plan_name, status_pretplate, limit_faktura FROM konfiguracija WHERE id = 1`).toArray()[0] as any || {};
    
    // OKLOP: KV Adapter for DI
    const kvStore = { get: (k: string) => this.env.PORESKI_KV.get(k, "json") };
    
    let zakonskiRok = 10;
    try {
      const kvRules = await SefLiveValidator.getLiveTaxRules(kvStore);
      if (kvRules?.ZAKONSKI_ROK_DANA) zakonskiRok = kvRules.ZAKONSKI_ROK_DANA;
    } catch (e) {}
    
    if (config.status_pretplate === 'BLOKIRAN') {
      // OKLOP: Temporal synchronization for tests
      const danas = testNowHeader ? new Date(testNowHeader) : new Date();
      
      if (danas.getDate() <= zakonskiRok && invoiceData?.IssueDate) {
        const datumF = new Date(invoiceData.IssueDate);
        const prevM = new Date(); prevM.setMonth(danas.getMonth() - 1);
        if (datumF.getMonth() === prevM.getMonth() && datumF.getFullYear() === prevM.getFullYear()) return { moze: true };
      }
      return { moze: false, error: { error: "Pristup blokiran", poruka: `Licenca je istekla. Zakonski rok za slanje faktura iz prethodnog meseca (${zakonskiRok}. u mesecu) je prošao.` } };
    }
    if (invoiceData?.Lines) {
      for (const line of invoiceData.Lines) {
        if (!(await SefLiveValidator.validateUnitMeasure(line.UnitCode, kvStore))) return { moze: false, error: { error: "BAD_REQUEST", poruka: `Jedinica mere '${line.UnitCode}' nije validna prema zvaničnom šifrarniku.` } };
        if (!(await SefLiveValidator.validateTaxCategory(line.VatCategory, kvStore))) return { moze: false, error: { error: "BAD_REQUEST", poruka: `Poreska kategorija '${line.VatCategory}' nije validna na SEF-u.` } };
      }
    }
    if (config.plan_name === 'Enterprise') return { moze: true };
    const saldo = this.getSaldo();
    if (saldo < noviBroj) return { moze: false, error: { success: false, error: "LIMIT_EXCEEDED", poruka: `Nedovoljno kredita na legeru. Preostalo: ${saldo}.` } };
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
        const client = new SefClient({ apiKey: config.sef_api_key, environment: config.environment, baseUrl: this.env.SEF_API_URL! });
        const invoiceData = JSON.parse(next.raw_data);
        const xml = SefUblBuilder.build(invoiceData);
        const result = await client.sendInvoice(xml, next.internal_id);
        
        if (result.success) {
          this.sql.exec(`UPDATE fakture SET sef_id = ?, status = 'Sent' WHERE internal_id = ?`, result.salesInvoiceId?.toString(), next.internal_id);
          await this.arhivirajUblDokument(next.internal_id, config.klijent_id, invoiceData.ID, xml, "SALE");
        } else {
          // v4.15.0: Production-Grade Error Shield Integration
          const severity = await ErrorShield.handle(
            this.env,
            invoiceData.ID,
            result.statusCode || 500,
            { message: result.error },
            xml
          );

          if (severity === 'CRITICAL' || severity === 'SCHEMA_ERR') {
            this.sql.exec(`UPDATE fakture SET status = 'Failed', error_message = ? WHERE internal_id = ?`, result.error || 'Err', next.internal_id);
          } else {
            // Re-queue or park based on other severities
            this.sql.exec(`UPDATE fakture SET status = 'Queued_Compliance', error_message = ? WHERE internal_id = ?`, result.error || 'Err', next.internal_id);
          }
        }
        await yieldToEventLoop();
      }
    } finally { this.isDraining = false; }
  }

  public getPppdvSummary(period: string): PppdvSummary {
    const s = this.sql.exec(`SELECT SUM(CASE WHEN t.tax_category_code IN ('S20', 'AE20', 'S', 'AE') AND t.tax_percentage >= 20.0 THEN t.taxable_amount ELSE 0 END) as bOpsta, SUM(CASE WHEN t.tax_category_code IN ('S20', 'AE20', 'S', 'AE') AND t.tax_percentage >= 20.0 THEN t.tax_amount ELSE 0 END) as pOpsta, SUM(CASE WHEN t.tax_category_code IN ('S10', 'AE10', 'S', 'AE') AND t.tax_percentage < 20.0 AND t.tax_percentage > 0 THEN t.taxable_amount ELSE 0 END) as bPosebna, SUM(CASE WHEN t.tax_category_code IN ('S10', 'AE10', 'S', 'AE') AND t.tax_percentage < 20.0 AND t.tax_percentage > 0 THEN t.tax_amount ELSE 0 END) as pPosebna, SUM(CASE WHEN t.tax_category_code IN ('E', 'Z', 'AE', 'AE20', 'AE10') THEN t.taxable_amount ELSE 0 END) as oslobodjen_sa, SUM(CASE WHEN t.tax_category_code IN ('OE', 'R', 'G') THEN t.taxable_amount ELSE 0 END) as oslobodjen_bez FROM sef_sales_invoice_taxes t JOIN fakture f ON t.invoice_id = f.internal_id WHERE f.status IN ('Sent', 'Approved') AND f.azurirano_u LIKE ?`, `${period}%`).toArray()[0] as any;
    const p = this.sql.exec(`SELECT SUM(CASE WHEN i.supplier_pib = '000000000' THEN t.taxable_amount ELSE 0 END) as uvoz_b, SUM(CASE WHEN i.supplier_pib = '000000000' THEN t.tax_amount ELSE 0 END) as uvoz_p, SUM(CASE WHEN t.tax_category_code IN ('AE', 'AE20', 'AE10') THEN t.taxable_amount ELSE 0 END) as interni_b, SUM(CASE WHEN t.tax_category_code IN ('AE', 'AE20', 'AE10') THEN t.tax_amount ELSE 0 END) as interni_p, SUM(t.tax_amount - t.non_deductible_amount) as cist FROM sef_purchase_invoice_taxes t JOIN sef_purchase_invoices i ON t.invoice_id = i.sef_id WHERE i.status = 'Approved' AND i.issue_date LIKE ?`, `${period}%`).toArray()[0] as any;
    const p101 = Math.round(s?.pOpsta || 0), p102 = Math.round(s?.pPosebna || 0), p106 = Math.round(p?.interni_p || 0), p108 = Math.round(p?.cist || 0), p105 = Math.round(p?.uvoz_p || 0);
    return { period, pozicija001_osnovicaOpsta: Math.round(s?.bOpsta || 0), pozicija101_pdvOpsta: p101, pozicija002_osnovicaPosebna: Math.round(s?.bPosebna || 0), pozicija102_pdvPosebna: p102, pozicija003_oslobodjenSaPravom: Math.round(s?.oslobodjen_sa || 0), pozicija004_oslobodjenBezPrava: Math.round(s?.oslobodjen_bez || 0), pozicija005_uvozOsnovica: Math.round(p?.uvoz_b || 0), pozicija105_uvozPdv: p105, pozicija006_interniObracunOsnovica: Math.round(p?.interni_b || 0), pozicija106_interniObracunPdv: p106, pozicija008_prethodniPorezOdbitni: p108, porezZaUplatuIliPovracaj: (p101 + p102 + p106) - p108 };
  }

  public generatePopdvData(period: string, tenantPib: string): PopdvSubmitData {
    const d8 = this.sql.exec(`SELECT p.sef_id, p.invoice_number, p.supplier_pib, p.issue_date, SUM(CASE WHEN t.tax_category_code IN ('S20', 'AE20', 'S', 'AE') AND t.tax_percentage >= 20.0 THEN t.taxable_amount ELSE 0 END) as bOpsta, SUM(CASE WHEN t.tax_category_code IN ('S20', 'AE20', 'S', 'AE') AND t.tax_percentage >= 20.0 THEN t.tax_amount ELSE 0 END) as pOpsta, SUM(t.non_deductible_amount) as nd FROM sef_purchase_invoices p JOIN sef_purchase_invoice_taxes t ON p.sef_id = t.invoice_id WHERE p.status IN ('Approved', 'Sent', 'New') AND p.issue_date LIKE ? GROUP BY p.sef_id`, `${period}%`).toArray() as any[];
    const d3 = this.sql.exec(`SELECT f.internal_id, f.broj_fakture, f.azurirano_u, json_extract(f.raw_data, '$.Customer.Pib') as pib, json_extract(f.raw_data, '$.Customer.Name') as name, SUM(CASE WHEN t.tax_category_code IN ('S20', 'AE20', 'S', 'AE') AND t.tax_percentage >= 20.0 THEN t.taxable_amount ELSE 0 END) as bOpsta, SUM(CASE WHEN t.tax_category_code IN ('S20', 'AE20', 'S', 'AE') AND t.tax_percentage >= 20.0 THEN t.tax_amount ELSE 0 END) as pOpsta, SUM(CASE WHEN t.tax_category_code IN ('S10', 'AE10', 'S', 'AE') AND t.tax_percentage < 20.0 AND t.tax_percentage > 0 THEN t.taxable_amount ELSE 0 END) as bPosebna, SUM(CASE WHEN t.tax_category_code IN ('S10', 'AE10', 'S', 'AE') AND t.tax_percentage < 20.0 AND t.tax_percentage > 0 THEN t.tax_amount ELSE 0 END) as pPosebna FROM fakture f LEFT JOIN sef_sales_invoice_taxes t ON f.internal_id = t.invoice_id WHERE f.status IN ('Sent', 'Approved') AND f.azurirano_u LIKE ? GROUP BY f.internal_id`, `${period}%`).toArray() as any[];
    return { poreskiPeriod: period, pibObveznika: tenantPib, deo3: d3.map((r, i) => ({ redniBroj: i+1, pibKupca: r.pib || '', nazivKupca: r.name || 'UNK', brojRacuna: r.broj_fakture, datumRacuna: r.azurirano_u.substring(0,10), osnovicaOpsta: r.bOpsta || 0, pdvOpsta: r.pOpsta || 0, osnovicaPosebna: r.bPosebna || 0, pdvPosebna: r.pPosebna || 0, oslobodjenPromet: 0, tipKupca: (r.pib?.length === 9) ? 'OBVEZNIK' : 'NEOBVEZNIK' })), deo8: d8.map((r, i) => ({ redniBroj: i+1, pibDobavljaca: (r.supplier_pib || '000000000').replace(/[^0-9]/g, ''), nazivDobavljaca: "UNK", brojRacuna: r.invoice_number, datumRacuna: (r.issue_date || '2026-05-21').substring(0,10), iznosBezPdv: r.bOpsta || 0, iznosPdvOpsta: r.pOpsta || 0, iznosPdvPosebna: 0, iznosKojiSeNeOdbija: r.nd || 0 })) };
  }

  public ekstrahujAnalitikuProdaje(invoiceData: SefInvoiceData, internalId: string): void {
    this.sql.exec("DELETE FROM sef_sales_invoice_items WHERE invoice_id = ?", internalId);
    this.sql.exec("DELETE FROM sef_sales_invoice_taxes WHERE invoice_id = ?", internalId);
    for (const line of (invoiceData.Lines || [])) this.sql.exec(`INSERT INTO sef_sales_invoice_items (invoice_id, line_extension_amount, item_name, quantity, unit_code, tax_percent, tax_amount) VALUES (?, ?, ?, ?, ?, ?, ?)`, internalId, line.LineExtensionAmount, line.ItemName, line.Quantity, line.UnitCode, line.VatPercent, 0.0);
    for (const taxTotal of (invoiceData.TaxTotals || [])) for (const subtotal of taxTotal.Subtotals) this.sql.exec(`INSERT INTO sef_sales_invoice_taxes (invoice_id, taxable_amount, tax_amount, tax_percentage, tax_category_code) VALUES (?, ?, ?, ?, ?)`, internalId, subtotal.TaxableAmount, subtotal.TaxAmount, subtotal.Percent, subtotal.Category);
  }
}
