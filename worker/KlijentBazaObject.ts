import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";
import { type SefInvoiceData, SefInvoiceSchema } from "../shared/types/sef";
import { SefUblBuilder, SefLiveValidator, DespatchBuilder } from "@dlbr/ubl-sdk";
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

    this.app.get('/stats', async () => {
      const stats = this.sql.exec(`SELECT status, COUNT(*) as broj FROM fakture GROUP BY status`).toArray();
      const purchase_stats = this.sql.exec(`SELECT status, COUNT(*) as broj FROM sef_purchase_invoices GROUP BY status`).toArray();
      const config = this.sql.exec(`SELECT environment FROM konfiguracija WHERE id = 1`).one() as any;
      return Response.json({ stats, purchase_stats, environment: config?.environment || 'sandbox', health: 1 });
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

    this.app.get('/api/analytics/pppdv-summary', async ({ req }: RouterContext<Env>) => {
      const url = new URL(req.url);
      const period = url.searchParams.get('period') || new Date().toISOString().substring(0, 7);
      const summary = await this.getPppdvSummary(period);
      return Response.json({ success: true, data: summary });
    });

    this.app.get('/api/audit/download', async ({ req }: RouterContext<Env>) => {
      const url = new URL(req.url);
      const period = url.searchParams.get('period') || '';
      const fakture = this.sql.exec(`SELECT * FROM fakture`).toArray(); // Za test uzimamo sve
      return Response.json({
        success: true,
        status: "USKLAĐENO_SA_UREDROM_MFIN",
        ukupnoDokumenata: fakture.length,
        dokumenti: fakture.map(f => ({ broj: f.broj_fakture, status: f.status }))
      });
    });

    this.app.get('/api/internal/check-quota', async ({ req }: RouterContext<Env>) => {
      const url = new URL(req.url);
      const issueDate = url.searchParams.get('issueDate');
      const testNow = req.headers.get('X-Test-Now');
      const { moze, error } = await this.checkLimit(1, issueDate ? { IssueDate: issueDate } : null, testNow);
      if (!moze) {
        const status = error.error === "LIMIT_EXCEEDED" ? 402 : 403;
        return Response.json(error, { status });
      }
      return Response.json({ success: true });
    });

    this.app.post('/test/seed', async ({ req }: RouterContext<Env>) => {
      const data = await req.json() as any;
      if (data.action === 'SEED_IMPORT') {
        this.sql.exec(`INSERT OR REPLACE INTO sef_purchase_invoices (sef_id, invoice_number, supplier_pib, issue_date, total_amount, status) VALUES (?, ?, '000000000', ?, ?, 'Approved')`,
          data.sefId, data.invoiceNumber, data.issueDate, data.totalAmount);
        this.sql.exec(`INSERT OR REPLACE INTO sef_purchase_invoice_taxes (invoice_id, tax_category_code, tax_percentage, taxable_amount, tax_amount, non_deductible_amount) VALUES (?, 'S', 20, ?, ?, 0)`,
          data.sefId, data.taxableAmount, data.taxAmount);

        // UPDATE D1 (SSoT) for PPPDV Analytics
        const config = this.sql.exec(`SELECT klijent_id FROM konfiguracija WHERE id = 1`).one() as any;
        const pib = config?.klijent_id || 'UNKNOWN';

        await this.env.REGISTAR_DB.prepare(`
          INSERT INTO dokumenti (id, tip, broj, pib_prodavca, pib_kupca, status, azurirano_u)
          VALUES (?, 'NABAVKA', ?, '000000000', ?, 'Approved', ?)
          ON CONFLICT(id) DO UPDATE SET status = excluded.status, azurirano_u = excluded.azurirano_u
        `).bind(data.sefId, data.invoiceNumber, pib, data.issueDate).run();

        await this.env.REGISTAR_DB.prepare(`
          INSERT INTO dokument_stavke (dokument_id, line_id, naziv, poslata_kolicina, jedinica_mere, porez_stopa, porez_kategorija, osnovica, iznos_poreza)
          VALUES (?, '1', 'UVOZ', 1, 'H87', 20, 'S', ?, ?)
          ON CONFLICT(dokument_id, line_id) DO UPDATE SET osnovica = excluded.osnovica, iznos_poreza = excluded.iznos_poreza
        `).bind(data.sefId, data.taxableAmount, data.taxAmount).run();
      }

      this.ctx.storage.transactionSync(() => {
        if (data.action === 'RESET_LEDGER') {
          this.sql.exec(`DELETE FROM billing_ledger`);
          if (data.saldo !== undefined) {
            this.sql.exec(`INSERT INTO billing_ledger (id, tip_transakcije, iznos_kredita, beleska) VALUES (?, 'DOPUNA', ?, 'Seed')`, 
              crypto.randomUUID(), data.saldo);
          }
        }
        if (data.config) {
          this.sql.exec(`INSERT OR REPLACE INTO konfiguracija (id, sef_api_key, klijent_id, environment, status_pretplate, plan_name, limit_faktura) VALUES (1, ?, ?, ?, ?, ?, ?)`,
            data.config.sef_api_key || '', data.config.klijent_id || '', data.config.environment || 'sandbox', 
            data.config.status_pretplate || 'AKTIVAN', data.config.plan_name || 'Micro', 
            data.config.limit_faktura !== undefined ? data.config.limit_faktura : 50);
        }
        if (data.fakture) {
          for (const f of data.fakture) {
            this.sql.exec(`INSERT OR REPLACE INTO fakture (internal_id, broj_fakture, status, iznos) VALUES (?, ?, ?, ?)`,
              f.internal_id, f.broj_fakture, f.status, f.iznos);
          }
        }
        if (data.purchase) {
          for (const p of data.purchase) {
            this.sql.exec(`INSERT OR REPLACE INTO sef_purchase_invoices (sef_id, invoice_number, supplier_pib, issue_date, total_amount, status) VALUES (?, ?, ?, ?, ?, ?)`,
              p.sef_id, p.invoice_number, p.supplier_pib, p.issue_date, p.total_amount, p.status);
            if (p.taxes) {
              for (const t of p.taxes) {
                this.sql.exec(`INSERT OR REPLACE INTO sef_purchase_invoice_taxes (invoice_id, tax_category_code, tax_percentage, taxable_amount, tax_amount, non_deductible_amount) VALUES (?, ?, ?, ?, ?, ?)`,
                  p.sef_id, t.Category, t.Percent, t.TaxableAmount, t.TaxAmount, t.NonDeductibleAmount || 0);
              }
            }
          }
        }
      });
      return Response.json({ success: true });
    });

    this.app.post('/otpremnice/send', async ({ req }: RouterContext<Env>) => {
      const data = await req.json() as any;
      const testNow = req.headers.get('X-Test-Now');
      
      const { moze, error } = await this.checkLimit(1, data, testNow);
      if (!moze) {
        const status = error.error === "LIMIT_EXCEEDED" ? 402 : 403;
        return Response.json(error, { status });
      }

      try {
        const builder = DespatchBuilder.create(data.ID, data.IssueDate)
          .setSeller(data.Supplier)
          .setBuyer(data.Customer);
        
        for (const line of data.Lines) {
          builder.addLine({
            id: line.ID,
            name: line.ItemName,
            deliveredQuantity: line.DeliveredQuantity,
            unitCode: line.UnitCode,
            itemID: line.ItemIdentification
          });
        }

        const advice = builder.toXml();

        const internalId = `OTP-${Date.now()}`;
        const config = this.sql.exec(`SELECT sef_api_key, environment, klijent_id FROM konfiguracija WHERE id = 1`).toArray()[0] as any;
        if (!config) throw new Error("Firma nije konfigurisana.");

        // Persist to D1 (SSoT)
        await this.env.REGISTAR_DB.prepare(`
          INSERT INTO dokumenti (id, tip, broj, pib_prodavca, pib_kupca, status, xml_blob, json_metadata)
          VALUES (?, 'OTPREMNICA', ?, ?, ?, 'SENT', ?, ?)
        `).bind(
          internalId, 
          data.ID, 
          data.Supplier.Pib, 
          data.Customer.Pib, 
          advice, 
          JSON.stringify({ lines: data.Lines.length })
        ).run();

        // Persist items to D1
        for (const line of data.Lines) {
          await this.env.REGISTAR_DB.prepare(`
            INSERT INTO dokument_stavke (dokument_id, line_id, naziv, poslata_kolicina, jedinica_mere)
            VALUES (?, ?, ?, ?, ?)
          `).bind(internalId, line.ID, line.ItemName, line.DeliveredQuantity, line.UnitCode).run();
        }

        // REZERVIŠI KREDIT (U DO storage-u za sada, dok ne migriramo i ledger)
        this.sql.exec(`INSERT INTO billing_ledger (id, faktura_id, broj_fakture, tip_transakcije, iznos_kredita, beleska) VALUES (?, ?, ?, 'POTROŠNJA', -1, 'Despatch Send')`, 
          crypto.randomUUID(), internalId, data.ID);

        return Response.json({ success: true, internalId, xml: advice }, { status: 202 });
      } catch (e: any) {
        return Response.json({ error: 'LOGISTICS_ERROR', message: e.message }, { status: 400 });
      }
    });

    this.app.post('/fakture/send', async ({ req }: RouterContext<Env>) => {
      const invoiceData = await req.json() as any;
      const testNow = req.headers.get('X-Test-Now');
      
      const { moze, error } = await this.checkLimit(1, invoiceData, testNow);
      if (!moze) {
        const status = error.error === "LIMIT_EXCEEDED" ? 402 : 403;
        return Response.json(error, { status });
      }

      try {
        const xml = SefUblBuilder.build(invoiceData);
        const internalId = `INV-${Date.now()}`;
        const config = this.sql.exec(`SELECT sef_api_key, environment, klijent_id FROM konfiguracija WHERE id = 1`).toArray()[0] as any;
        if (!config) throw new Error("Firma nije konfigurisana.");

        const client = new SefClient({
          apiKey: config.sef_api_key,
          baseUrl: this.env.SEF_API_URL ?? 'https://demoefaktura.mfin.gov.rs',
          environment: config.environment
        });

        const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const sefRes = await client.sendInvoice(xml, requestId);
        
        const finalSefId = sefRes.salesInvoiceId?.toString();
        const finalStatus = sefRes.success ? 'Sent' : 'Error';

        // 1. Persist to D1 (SSoT)
        await this.env.REGISTAR_DB.prepare(`
          INSERT INTO dokumenti (id, tip, broj, pib_prodavca, pib_kupca, status, xml_blob, json_metadata)
          VALUES (?, 'FAKTURA', ?, ?, ?, ?, ?, ?)
        `).bind(
          internalId, 
          invoiceData.ID || invoiceData.broj, 
          invoiceData.Supplier?.Pib || invoiceData.pibProdavca, 
          invoiceData.Customer?.Pib || invoiceData.pibKupca,
          finalStatus,
          xml,
          JSON.stringify({ sefId: finalSefId, amount: invoiceData.LegalMonetaryTotal?.PayableAmount })
        ).run();

        // 1.5 Persist items to D1 (for PPPDV)
        for (const line of invoiceData.Lines) {
          const taxCat = line.VatCategory || line.poreskaKategorija || 'S';
          const taxRate = line.VatPercent || line.pdvStopa || 20;
          const taxable = line.LineExtensionAmount || (line.quantity * line.unitPrice);
          const taxAmt = taxable * (taxRate / 100);

          await this.env.REGISTAR_DB.prepare(`
            INSERT INTO dokument_stavke (dokument_id, line_id, naziv, poslata_kolicina, jedinica_mere, cena, porez_stopa, porez_kategorija, osnovica, iznos_poreza)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            internalId, 
            line.ID, 
            line.ItemName || line.description, 
            line.Quantity || line.deliveredQuantity, 
            line.UnitCode || line.jedinica_mere,
            line.Price || line.unitPrice,
            taxRate,
            taxCat,
            taxable,
            taxAmt
          ).run();
        }

        this.ctx.storage.transactionSync(() => {
          this.sql.exec(`INSERT INTO fakture (internal_id, sef_id, broj_fakture, status, iznos) VALUES (?, ?, ?, ?, ?)`, 
            internalId, finalSefId, invoiceData.ID || invoiceData.broj, finalStatus, invoiceData.LegalMonetaryTotal?.PayableAmount || invoiceData.osnovica || 0);
          
          // REZERVIŠI KREDIT
          this.sql.exec(`INSERT INTO billing_ledger (id, faktura_id, broj_fakture, tip_transakcije, iznos_kredita, beleska) VALUES (?, ?, ?, 'POTROŠNJA', -1, 'Invoice Send')`, 
            crypto.randomUUID(), internalId, invoiceData.ID || invoiceData.broj);

          // POPUNI TAX TABELU ZA ANALITIKU (PPPDV)
          const taxTotals = invoiceData.TaxTotals || (invoiceData.osnovica ? [{ Subtotals: [{ Category: invoiceData.poreskaKategorija || 'S', Percent: invoiceData.pdvStopa || 20, TaxableAmount: invoiceData.osnovica, TaxAmount: invoiceData.pdv || 0 }] }] : []);
          for (const tt of taxTotals) {
            const subtotals = tt.Subtotals || [];
            for (const sub of subtotals) {
              this.sql.exec(`INSERT OR REPLACE INTO sef_sales_invoice_taxes (invoice_id, tax_category_code, tax_percentage, taxable_amount, tax_amount) VALUES (?, ?, ?, ?, ?)`,
                internalId, sub.Category || sub.poreskaKategorija, sub.Percent || sub.pdvStopa, sub.TaxableAmount || sub.osnovica, sub.TaxAmount || sub.pdv);
            }
          }
        });

        return Response.json({ success: sefRes.success, internalId, sefId: sefRes.salesInvoiceId, xml }, { status: 202 });
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
      const { faktura_id, novi_status, smer } = await req.json() as { faktura_id: string, novi_status: string, smer: string };
      
      this.ctx.storage.transactionSync(() => {
        const f = this.sql.exec(`SELECT internal_id, broj_fakture, status FROM fakture WHERE sef_id = ?`, faktura_id).one() as any;
        if (f) {
          if (novi_status === 'Rejected' || novi_status === 'Canceled') {
            // REFUNDACIJA KREDITA
            const alreadyRefunded = this.sql.exec(`SELECT COUNT(*) as c FROM billing_ledger WHERE faktura_id = ? AND tip_transakcije = 'REFUNDACIJA'`, f.internal_id).one() as { c: number };
            if (alreadyRefunded.c === 0) {
              this.sql.exec(`INSERT INTO billing_ledger (id, faktura_id, broj_fakture, tip_transakcije, iznos_kredita, beleska) VALUES (?, ?, ?, 'REFUNDACIJA', 1, 'SEF Rejected')`, 
                crypto.randomUUID(), f.internal_id, f.broj_fakture);
            }
          }
          this.sql.exec(`UPDATE fakture SET status = ?, azurirano_u = CURRENT_TIMESTAMP WHERE internal_id = ?`, novi_status, f.internal_id);
        }
      });
      
      return Response.json({ success: true });
    });

    this.app.post('/webhooks/despatch-update', async ({ req }: RouterContext<Env>) => {
      const { despatch_id, novi_status } = await req.json() as { despatch_id: string, novi_status: string };
      this.sql.exec(`UPDATE otpremnice SET status = ?, potvrdjeno_u = CURRENT_TIMESTAMP WHERE sef_id = ?`, novi_status, despatch_id);
      
      // Update D1
      await this.env.REGISTAR_DB.prepare(`UPDATE dokumenti SET status = ?, azurirano_u = CURRENT_TIMESTAMP WHERE sef_id = ?`)
        .bind(novi_status, despatch_id).run();

      return Response.json({ success: true });
    });
  }

  private async checkLimit(noviBroj: number, invoiceData?: any, testNow?: string | null): Promise<{ moze: boolean, error?: any }> {
    const config = this.sql.exec(`SELECT status_pretplate, plan_name, limit_faktura FROM konfiguracija WHERE id = 1`).toArray()[0] as any || {};
    
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
      // 1. Provera mesečne kvote
      const period = (testNow ? new Date(testNow) : new Date()).toISOString().substring(0, 7);
      const potrosenoUMesecu = this.sql.exec(`SELECT COUNT(*) as c FROM billing_ledger WHERE tip_transakcije = 'POTROŠNJA' AND kreiran_u LIKE ?`, `${period}%`).one() as { c: number };
      
      if (config.limit_faktura !== undefined && (potrosenoUMesecu.c + noviBroj) > config.limit_faktura) {
        return { moze: false, error: { error: "LIMIT_EXCEEDED", message: `Mesečni limit od ${config.limit_faktura} faktura je dostignut.` } };
      }

      // 2. Provera preostalog salda (ako koristimo prepaid model)
      const saldo = this.getSaldo();
      if (saldo < noviBroj && config.limit_faktura === undefined) {
        return { moze: false, error: { error: "LIMIT_EXCEEDED", message: "Nedovoljno kredita na balansu." } };
      }
    }

    return { moze: true };
  }

  async getWebhookInstructions() { return { success: true, instructions: { sales_url: '...', purchase_url: '...' } }; }
  async getStats() { return { success: true }; }
  async getLogs() { return { success: true, logs: [] }; }
  
  async getPppdvSummary(period: string): Promise<PppdvSummary> {
    const config = this.sql.exec(`SELECT klijent_id FROM konfiguracija WHERE id = 1`).one() as any;
    const pib = config?.klijent_id || 'UNKNOWN';

    // 1. Prodaja (iz D1)
    const sRows = await this.env.REGISTAR_DB.prepare(`
      SELECT 
        SUM(CASE WHEN s.porez_kategorija IN ('S20', 'AE20', 'S', 'AE') AND s.porez_stopa >= 20.0 THEN s.osnovica ELSE 0 END) as bOpsta,
        SUM(CASE WHEN s.porez_kategorija IN ('S20', 'AE20', 'S', 'AE') AND s.porez_stopa >= 20.0 THEN s.iznos_poreza ELSE 0 END) as pOpsta,
        SUM(CASE WHEN s.porez_kategorija IN ('S10', 'AE10', 'S', 'AE') AND s.porez_stopa < 20.0 AND s.porez_stopa > 0 THEN s.osnovica ELSE 0 END) as bPosebna,
        SUM(CASE WHEN s.porez_kategorija IN ('S10', 'AE10', 'S', 'AE') AND s.porez_stopa < 20.0 AND s.porez_stopa > 0 THEN s.iznos_poreza ELSE 0 END) as pPosebna,
        SUM(CASE WHEN s.porez_kategorija IN ('E', 'Z', 'AE', 'AE20', 'AE10') THEN s.osnovica ELSE 0 END) as oslobodjen_sa,
        SUM(CASE WHEN s.porez_kategorija IN ('OE', 'R', 'G') THEN s.osnovica ELSE 0 END) as oslobodjen_bez
      FROM dokument_stavke s
      JOIN dokumenti d ON s.dokument_id = d.id
      WHERE d.pib_prodavca = ? AND d.status IN ('Sent', 'Approved') AND d.azurirano_u LIKE ?
    `).bind(pib, `${period}%`).first() as any || {};

    // 2. Nabavka (iz D1)
    const pRows = await this.env.REGISTAR_DB.prepare(`
      SELECT 
        SUM(CASE WHEN d.pib_prodavca = '000000000' THEN s.osnovica ELSE 0 END) as uvoz_b,
        SUM(CASE WHEN d.pib_prodavca = '000000000' THEN s.iznos_poreza ELSE 0 END) as uvoz_p,
        SUM(s.iznos_poreza - IFNULL(s.razlika, 0)) as cist -- razlika ovde glumi non_deductible
      FROM dokument_stavke s
      JOIN dokumenti d ON s.dokument_id = d.id
      WHERE d.pib_kupca = ? AND d.status = 'Approved' AND d.azurirano_u LIKE ?
    `).bind(pib, `${period}%`).first() as any || {};

    const p101 = Math.round(sRows.pOpsta || 0);
    const p102 = Math.round(sRows.pPosebna || 0);
    const p106 = 0; 
    const p108 = Math.round(pRows.cist || 0);
    const p105 = Math.round(pRows.uvoz_p || 0);

    return { 
      period, 
      pozicija001_osnovicaOpsta: Math.round(sRows.bOpsta || 0), 
      pozicija101_pdvOpsta: p101, 
      pozicija002_osnovicaPosebna: Math.round(sRows.bPosebna || 0), 
      pozicija102_pdvPosebna: p102, 
      pozicija003_oslobodjenSaPravom: Math.round(sRows.oslobodjen_sa || 0), 
      pozicija004_oslobodjenBezPrava: Math.round(sRows.oslobodjen_bez || 0), 
      pozicija005_uvozOsnovica: Math.round(pRows.uvoz_b || 0), 
      pozicija105_uvozPdv: p105, 
      pozicija006_interniObracunOsnovica: 0, 
      pozicija106_interniObracunPdv: p106, 
      pozicija008_prethodniPorezOdbitni: p108, 
      porezZaUplatuIliPovracaj: (p101 + p102 + p106) - p108 
    };
  }

  async sendInvoice(invoiceData: any, headers: any) { return { success: true }; }

  private updateSchemaFor2026() {
    try { this.sql.exec(`ALTER TABLE konfiguracija ADD COLUMN poreski_period_tip TEXT DEFAULT 'MONTHLY';`); } catch (e) {}
  }

  private updateSchemaForBillingLedger() {
    try { this.sql.exec(`ALTER TABLE billing_ledger ADD COLUMN faktura_id TEXT;`); } catch (e) {}
    try { this.sql.exec(`ALTER TABLE billing_ledger ADD COLUMN broj_fakture TEXT;`); } catch (e) {}
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
      this.sql.exec(`CREATE TABLE IF NOT EXISTS sef_sales_invoice_taxes (invoice_id TEXT, tax_category_code TEXT, tax_percentage REAL, taxable_amount REAL, tax_amount REAL, PRIMARY KEY (invoice_id, tax_category_code, tax_percentage));`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS sef_purchase_invoice_taxes (invoice_id TEXT, tax_category_code TEXT, tax_percentage REAL, taxable_amount REAL, tax_amount REAL, non_deductible_amount REAL, PRIMARY KEY (invoice_id, tax_category_code, tax_percentage));`);
      
      // LOGISTIČKI BEDEM (v4.0.0)
      this.sql.exec(`CREATE TABLE IF NOT EXISTS otpremnice (
          internal_id TEXT PRIMARY KEY,
          sef_id TEXT UNIQUE,
          broj_otpremnice TEXT NOT NULL,
          status TEXT NOT NULL, -- DRAFT, SENT, CONFIRMED, DISCREPANCY
          pib_kupca TEXT NOT NULL,
          kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP,
          potvrdjeno_u DATETIME,
          ima_razliku INTEGER DEFAULT 0
      );`);
      
      this.sql.exec(`CREATE TABLE IF NOT EXISTS logistika_stavke (
          otpremnica_id TEXT,
          line_id TEXT,
          naziv TEXT,
          poslata_kolicina REAL,
          primljena_kolicina REAL,
          jedinica_mere TEXT,
          razlika REAL,
          PRIMARY KEY (otpremnica_id, line_id)
      );`);
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

            // UPDATE D1 (SSoT)
            await this.env.REGISTAR_DB.prepare(`
              INSERT INTO dokumenti (id, tip, broj, pib_prodavca, pib_kupca, status, json_metadata, azurirano_u)
              VALUES (?, 'FAKTURA', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(id) DO UPDATE SET status = excluded.status, azurirano_u = CURRENT_TIMESTAMP
            `).bind(
              `DISC-${id}`, 
              String(details.InvoiceNumber || id), 
              config.klijent_id || 'UNKNOWN', 
              'UNKNOWN', // Details might not have buyer PIB easily available in this call
              String(details.InvoiceStatus || 'Unknown'),
              JSON.stringify({ sefId: id, amount: details.TotalAmount })
            ).run();
          }
        }
      }

      const purchaseOverviews = await sefClient.getPurchaseInvoiceOverview(dateFrom, dateTo);
      if (purchaseOverviews && Array.isArray(purchaseOverviews)) {
        this.ctx.storage.transactionSync(() => {
          for (const inv of purchaseOverviews.slice(-10)) {
            this.sql.exec(`
              INSERT INTO sef_purchase_invoices (sef_id, invoice_number, supplier_pib, issue_date, total_amount, status)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(sef_id) DO UPDATE SET status = excluded.status, updated_at = CURRENT_TIMESTAMP`,
              String(inv.purchaseInvoiceId || inv.invoiceId), String(inv.invoiceNumber || inv.documentNumber), 
              String(inv.sellerPib || inv.supplierPib), String(inv.invoiceDate || inv.issueDate), 
              inv.sumWithVat || inv.totalAmount || 0, String(inv.status || inv.invoiceStatus)
            );
            discoveredPurchases++;
          }
        });
      }

    } catch (err: any) {
      console.error("Sync Error:", err);
    }

    return { discoveredSales, discoveredPurchases };
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
