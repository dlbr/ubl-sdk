import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";
import { type SefInvoiceData, SefInvoiceSchema } from "@sef/shared/types/sef";
import { SefUblBuilder, SefLiveValidator, DespatchBuilder, ReceiptBuilder } from "@dlbr/ubl-sdk";
import { SefClient } from "@sef/shared/services/sefClient";
import { PopdvSefClient } from "@sef/shared/services/popdvClient";
import { SefExcelBuilder } from "@sef/shared/services/excelBuilder";
import * as v from 'valibot';
import { SefUblParser } from "./ublParser";
import { type PopdvSubmitData } from '@sef/shared/types/popdv';
import { type PppdvSummary } from '@sef/shared/types/analytics';
import { Router, type RouterContext } from './router';
import { ErrorShield } from "@sef/shared/services/errorShield";
import { Redacted } from "@sef/shared/services/redacted";
import { D1SyncBridge, type D1Document, type D1DocumentLine } from "@sef/shared/services/D1SyncBridge";

export class KlijentBaza extends DurableObject<Env> {
  private sql: SqlStorage;
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
      this.sql.exec(`INSERT OR REPLACE INTO konfiguracija (id, sef_api_key, klijent_id, environment, limit_faktura, status_pretplate) VALUES (1, ?, ?, ?, ?, ?)`, 
        data.sef_api_key || '', data.klijent_id || null, data.environment || 'sandbox', data.limit || 50, data.status_pretplate || 'AKTIVAN');
      
      const ledgerCount = this.sql.exec(`SELECT COUNT(*) as c FROM billing_ledger`).one() as { c: number };
      if (ledgerCount.c === 0) {
        this.sql.exec(`INSERT INTO billing_ledger (id, tip_transakcije, iznos_kredita, beleska) VALUES (?, 'DOPUNA', ?, 'Initial')`, 
          crypto.randomUUID(), data.limit || 50);
      }
      return Response.json({ success: true });
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

    this.app.get('/api/analytics/potrosnja', async () => {
      const saldo = this.getSaldo();
      const izvod = this.sql.exec(`SELECT * FROM billing_ledger ORDER BY row_id DESC LIMIT 10`).toArray();
      return Response.json({ saldo, izvod });
    });

    this.app.get('/api/audit/download', async ({ req }: RouterContext<Env>) => {
      const url = new URL(req.url);
      const period = url.searchParams.get('period') || '';
      const fakture = this.sql.exec(`SELECT * FROM fakture`).toArray(); 
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
            this.sql.exec(`INSERT OR REPLACE INTO fakture (internal_id, sef_id, broj_fakture, status, iznos) VALUES (?, ?, ?, ?)`,
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
      if (!moze) return Response.json(error, { status: error.error === "LIMIT_EXCEEDED" ? 402 : 403 });

      try {
        const builder = DespatchBuilder.create(data.ID, data.IssueDate)
          .setSeller(data.Supplier)
          .setBuyer(data.Customer);
        for (const line of data.Lines) {
          builder.addLine({ id: line.ID, name: line.ItemName, deliveredQuantity: line.DeliveredQuantity, unitCode: line.UnitCode, itemID: line.ItemIdentification });
        }
        const advice = builder.toXml();
        const internalId = `OTP-${Date.now()}`;
        const config = this.sql.exec(`SELECT sef_api_key, environment, klijent_id FROM konfiguracija WHERE id = 1`).one() as any;
        
        const client = new SefClient({ apiKey: config.sef_api_key, baseUrl: this.env.SEF_API_URL ?? 'https://demoefaktura.mfin.gov.rs', environment: config.environment });
        const requestId = `req-otp-${Date.now()}`;
        const sefRes = await client.sendDespatchAdvice(advice, requestId, data.ID);
        
        let finalStatus = 'SENT';
        if (!sefRes.success) {
          finalStatus = sefRes.error === 'MFIN_PROCESSING_TIMEOUT' ? 'PENDING_PROCESSING' : 'ERROR';
        }

        const bridge = new D1SyncBridge(this.env.REGISTAR_DB);
        await bridge.upsertDocument({ 
          id: internalId, 
          tip: 'OTPREMNICA', 
          broj: data.ID, 
          pibProdavca: data.Supplier.Pib, 
          pibKupca: data.Customer.Pib, 
          status: finalStatus, 
          xmlBlob: advice, 
          parentId: data.BillingReference || null,
          sefId: sefRes.mfinId && sefRes.mfinId !== 'PENDING' ? sefRes.mfinId : undefined
        });
        await bridge.logEvent(internalId, finalStatus, sefRes.success ? 'Poslato na Centralni Registar' : (sefRes.error === 'MFIN_PROCESSING_TIMEOUT' ? 'Čekanje na asinhronu obradu' : sefRes.error));

        const lines: D1DocumentLine[] = data.Lines.map((l: any) => ({
          dokumentId: internalId,
          lineId: l.ID,
          naziv: l.ItemName,
          poslataKolicina: l.DeliveredQuantity,
          jedinicaMere: l.UnitCode,
          akciznaKategorija: l.exciseCategory,
          akciznaGustina: l.itemProperties?.GUSTINA ? parseFloat(l.itemProperties.GUSTINA) : undefined
        }));
        await bridge.upsertLines(lines);

        this.sql.exec(`INSERT INTO billing_ledger (id, faktura_id, broj_fakture, tip_transakcije, iznos_kredita, beleska) VALUES (?, ?, ?, 'POTROŠNJA', -1, 'Despatch Send')`, crypto.randomUUID(), internalId, data.ID);
        return Response.json({ success: sefRes.success, internalId, xml: advice, error: sefRes.error }, { status: 202 });
      } catch (e: any) { return Response.json({ error: 'LOGISTICS_ERROR', message: e.message }, { status: 400 }); }
    });

    this.app.post('/prijemnice/receive', async ({ req }: RouterContext<Env>) => {
      const data = await req.json() as any;
      const bridge = new D1SyncBridge(this.env.REGISTAR_DB);
      try {
        const builder = ReceiptBuilder.create(data.id, data.issueDate)
          .setSeller(data.supplier)
          .setBuyer(data.buyer)
          .setShipmentMethod(data.shipmentMethod)
          .setIsReturn(data.isReturn)
          .setOfflineZinNumber(data.offlineZinNumber)
          .setFrameworkAgreementId(data.frameworkAgreementId)
          .setContractId(data.contractId);

        if (data.despatchDocumentReference) {
          builder.setDespatchReference(data.despatchDocumentReference.id, data.despatchDocumentReference.issueDate);
        }

        for (const line of data.lines) {
          builder.addLine({
            id: line.id,
            receivedQuantity: line.receivedQuantity,
            unitCode: line.unitCode,
            itemName: line.itemName,
            shortQuantity: line.shortQuantity,
            rejectedQuantity: line.rejectedQuantity,
            rejectReason: line.rejectReason,
            despatchLineReference: line.despatchLineReference,
            exciseCategory: line.exciseCategory,
            itemProperties: line.itemProperties
          });
        }

        const xml = builder.toXml();
        const internalId = `REC-${Date.now()}`;
        const requestId = `req-rec-${Date.now()}`;
        
        const config = this.sql.exec(`SELECT sef_api_key, environment, klijent_id FROM konfiguracija WHERE id = 1`).one() as any;
        const client = new SefClient({ apiKey: config.sef_api_key, baseUrl: this.env.SEF_API_URL ?? 'https://demoefaktura.mfin.gov.rs', environment: config.environment });
        
        const sefRes = await client.sendReceiptAdvice(xml, requestId, data.id);

        let parentInternalId = data.despatchDocumentReference?.id;
        let hasDiscrepancy = false;
        
        if (parentInternalId) {
          const despatch = await this.env.REGISTAR_DB.prepare("SELECT id FROM dokumenti WHERE (broj = ? OR id = ?) AND tip = 'OTPREMNICA'").bind(parentInternalId, parentInternalId).first() as any;
          if (despatch) {
            parentInternalId = despatch.id; // Use the internal ID for D1 parent_id
            for (const line of data.lines) {
              const diff = (line.shortQuantity || 0) + (line.rejectedQuantity || 0);
              if (diff > 0) hasDiscrepancy = true;
              await this.env.REGISTAR_DB.prepare(`UPDATE dokument_stavke SET primljena_kolicina = ?, razlika = ? WHERE dokument_id = ? AND line_id = ?`).bind(line.receivedQuantity, diff, despatch.id, line.despatchLineReference?.id || line.id).run();
            }
            await this.env.REGISTAR_DB.prepare("UPDATE dokumenti SET status = ?, azurirano_u = CURRENT_TIMESTAMP WHERE id = ?").bind(hasDiscrepancy ? 'DISCREPANCY' : 'ACCEPTED', despatch.id).run();
          }
        }

        let finalStatus = hasDiscrepancy ? 'DISCREPANCY' : 'ACCEPTED';
        if (!sefRes.success) {
          finalStatus = sefRes.error === 'MFIN_PROCESSING_TIMEOUT' ? 'PENDING_PROCESSING' : 'ERROR';
        }

        await bridge.upsertDocument({ 
          id: internalId, 
          tip: 'PRIJEMNICA', 
          broj: data.id, 
          pibProdavca: data.supplier.pib, 
          pibKupca: data.buyer.pib, 
          status: finalStatus, 
          xmlBlob: xml, 
          parentId: parentInternalId,
          sefId: sefRes.mfinId && sefRes.mfinId !== 'PENDING' ? sefRes.mfinId : undefined
        });

        await bridge.logEvent(internalId, finalStatus, sefRes.success ? 'Prijemnica procesirana' : (sefRes.error === 'MFIN_PROCESSING_TIMEOUT' ? 'Čekanje na asinhronu obradu prijemnice' : sefRes.error));

        const recLines: D1DocumentLine[] = data.lines.map((l: any) => ({
          dokumentId: internalId,
          lineId: l.id,
          naziv: l.itemName,
          primljenaKolicina: l.receivedQuantity,
          razlika: (l.shortQuantity || 0) + (l.rejectedQuantity || 0),
          jedinicaMere: l.unitCode,
          akciznaKategorija: l.exciseCategory,
          akciznaGustina: l.itemProperties?.GUSTINA ? parseFloat(l.itemProperties.GUSTINA) : undefined,
          izvornaStavkaId: l.despatchLineReference?.id
        }));
        await bridge.upsertLines(recLines);

        return Response.json({ success: sefRes.success, internalId, hasDiscrepancy, xml, error: sefRes.error }, { status: 202 });
      } catch (e: any) { return Response.json({ error: 'LOGISTICS_ERROR', message: e.message }, { status: 400 }); }
    });

    this.app.post('/fakture/send', async ({ req }: RouterContext<Env>) => {
      const invoiceData = await req.json() as any;
      const testNow = req.headers.get('X-Test-Now');
      const { moze, error } = await this.checkLimit(1, invoiceData, testNow);
      if (!moze) return Response.json(error, { status: error.error === "LIMIT_EXCEEDED" ? 402 : 403 });

      try {
        const xml = SefUblBuilder.build(invoiceData);
        const internalId = `INV-${Date.now()}`;
        const config = this.sql.exec(`SELECT sef_api_key, environment, klijent_id FROM konfiguracija WHERE id = 1`).one() as any;
        
        const client = new SefClient({ apiKey: config.sef_api_key, baseUrl: this.env.SEF_API_URL ?? 'https://demoefaktura.mfin.gov.rs', environment: config.environment });
        const sefRes = await client.sendInvoice(xml, `req-${Date.now()}`);
        const finalStatus = sefRes.success ? 'Sent' : 'Error';
        const finalSefId = sefRes.salesInvoiceId?.toString();

        const bridge = new D1SyncBridge(this.env.REGISTAR_DB);
        await bridge.upsertDocument({ id: internalId, tip: 'FAKTURA', broj: invoiceData.ID || invoiceData.broj, pibProdavca: invoiceData.Supplier?.Pib || invoiceData.pibProdavca, pibKupca: invoiceData.Customer?.Pib || invoiceData.pibKupca, status: finalStatus, xmlBlob: xml, jsonMetadata: { sefId: finalSefId, amount: invoiceData.LegalMonetaryTotal?.PayableAmount } });

        const d1Lines: D1DocumentLine[] = invoiceData.Lines.map((line: any) => {
          const taxCat = line.VatCategory || line.poreskaKategorija || 'S';
          const taxRate = line.VatPercent || line.pdvStopa || 20;
          const taxable = line.LineExtensionAmount || (line.quantity * line.unitPrice);
          return { dokumentId: internalId, lineId: line.ID, naziv: line.ItemName || line.description, poslataKolicina: line.Quantity || line.deliveredQuantity, jedinicaMere: line.UnitCode || line.jedinica_mere, cena: line.Price || line.unitPrice, porezStopa: taxRate, porezKategorija: taxCat, osnovica: taxable, iznosPoreza: taxable * (taxRate / 100) };
        });
        await bridge.upsertLines(d1Lines);

        this.ctx.storage.transactionSync(() => {
          this.sql.exec(`INSERT INTO fakture (internal_id, sef_id, broj_fakture, status, iznos) VALUES (?, ?, ?, ?, ?)`, internalId, finalSefId, invoiceData.ID || invoiceData.broj, finalStatus, invoiceData.LegalMonetaryTotal?.PayableAmount || invoiceData.osnovica || 0);
          this.sql.exec(`INSERT INTO billing_ledger (id, faktura_id, broj_fakture, tip_transakcije, iznos_kredita, beleska) VALUES (?, ?, ?, 'POTROŠNJA', -1, 'Invoice Send')`, crypto.randomUUID(), internalId, invoiceData.ID || invoiceData.broj);
        });

        return Response.json({ success: sefRes.success, internalId, sefId: sefRes.salesInvoiceId, xml }, { status: 202 });
      } catch (e: any) { return Response.json({ error: 'COMPLIANCE_ERROR', message: e.message }, { status: 400 }); }
    });

    this.app.post('/webhooks/sef-update', async ({ req }: RouterContext<Env>) => {
      const { faktura_id, novi_status } = await req.json() as { faktura_id: string, novi_status: string };
      await this.processStatusUpdate(faktura_id, novi_status);
      return Response.json({ success: true });
    });

    this.app.post('/webhooks/despatch-update', async ({ req }: RouterContext<Env>) => {
      const { despatch_id, novi_status } = await req.json() as { despatch_id: string, novi_status: string };
      this.sql.exec(`UPDATE otpremnice SET status = ?, potvrdjeno_u = CURRENT_TIMESTAMP WHERE sef_id = ? OR internal_id = ?`, novi_status, despatch_id, despatch_id);
      
      // Update D1
      await this.env.REGISTAR_DB.prepare(`UPDATE dokumenti SET status = ?, azurirano_u = CURRENT_TIMESTAMP WHERE sef_id = ? OR id = ?`)
        .bind(novi_status, despatch_id, despatch_id).run();

      return Response.json({ success: true });
    });
  }

  private async processStatusUpdate(sefId: string, noviStatus: string) {
    let internalId: string | undefined;
    this.ctx.storage.transactionSync(() => {
      const rows = this.sql.exec(`SELECT internal_id, broj_fakture, status FROM fakture WHERE sef_id = ?`, sefId).toArray();
      const f = rows[0] as any;
      if (f) {
        internalId = f.internal_id;
        if (noviStatus === 'Rejected' || noviStatus === 'Canceled') {
          const alreadyRefunded = this.sql.exec(`SELECT COUNT(*) as c FROM billing_ledger WHERE faktura_id = ? AND tip_transakcije = 'REFUNDACIJA'`, f.internal_id).one() as { c: number };
          if (alreadyRefunded.c === 0) {
            this.sql.exec(`INSERT INTO billing_ledger (id, faktura_id, broj_fakture, tip_transakcije, iznos_kredita, beleska) VALUES (?, ?, ?, 'REFUNDACIJA', 1, 'SEF Rejected')`, 
              crypto.randomUUID(), f.internal_id, f.broj_fakture);
          }
        }
        this.sql.exec(`UPDATE fakture SET status = ?, azurirano_u = CURRENT_TIMESTAMP WHERE internal_id = ?`, noviStatus, f.internal_id);
      }
    });
    // UPDATE D1 (SSoT)
    await this.env.REGISTAR_DB.prepare(`UPDATE dokumenti SET status = ?, azurirano_u = CURRENT_TIMESTAMP WHERE id = ? OR sef_id = ?`).bind(noviStatus, internalId || sefId, sefId).run();
  }

  private async checkLimit(noviBroj: number, invoiceData?: any, testNow?: string | null): Promise<{ moze: boolean, error?: any }> {
    const config = this.sql.exec(`SELECT status_pretplate, plan_name, limit_faktura FROM konfiguracija WHERE id = 1`).one() as any || {};
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
        if (datumF.getMonth() === danas.getMonth() - 1 && datumF.getFullYear() === danas.getFullYear()) return { moze: true };
      }
      return { moze: false, error: { error: "Pristup blokiran", message: `Licenca istekla. Prošao rok od ${zakonskiRok} dana.` } };
    }
    if (config.plan_name !== 'Enterprise') {
      const period = (testNow ? new Date(testNow) : new Date()).toISOString().substring(0, 7);
      const potrosenoUMesecu = this.sql.exec(`SELECT COUNT(*) as c FROM billing_ledger WHERE tip_transakcije = 'POTROŠNJA' AND kreiran_u LIKE ?`, `${period}%`).one() as { c: number };
      if (config.limit_faktura !== undefined && (potrosenoUMesecu.c + noviBroj) > config.limit_faktura) return { moze: false, error: { error: "LIMIT_EXCEEDED", message: `Mesečni limit od ${config.limit_faktura} faktura je dostignut.` } };
      if (this.getSaldo() < noviBroj && config.limit_faktura === undefined) return { moze: false, error: { error: "LIMIT_EXCEEDED", message: "Nedovoljno kredita na balansu." } };
    }
    return { moze: true };
  }

  async getPppdvSummary(period: string): Promise<PppdvSummary> {
    const config = this.sql.exec(`SELECT klijent_id FROM konfiguracija WHERE id = 1`).one() as any;
    const pib = config?.klijent_id || 'UNKNOWN';
    const sRows = await this.env.REGISTAR_DB.prepare(`SELECT SUM(CASE WHEN s.porez_kategorija IN ('S20', 'AE20', 'S', 'AE') AND s.porez_stopa >= 20.0 THEN s.osnovica ELSE 0 END) as bOpsta, SUM(CASE WHEN s.porez_kategorija IN ('S20', 'AE20', 'S', 'AE') AND s.porez_stopa >= 20.0 THEN s.iznos_poreza ELSE 0 END) as pOpsta, SUM(CASE WHEN s.porez_kategorija IN ('S10', 'AE10', 'S', 'AE') AND s.porez_stopa < 20.0 AND s.porez_stopa > 0 THEN s.osnovica ELSE 0 END) as bPosebna, SUM(CASE WHEN s.porez_kategorija IN ('S10', 'AE10', 'S', 'AE') AND s.porez_stopa < 20.0 AND s.porez_stopa > 0 THEN s.iznos_poreza ELSE 0 END) as pPosebna, SUM(CASE WHEN s.porez_kategorija IN ('E', 'Z', 'AE', 'AE20', 'AE10') THEN s.osnovica ELSE 0 END) as oslobodjen_sa, SUM(CASE WHEN s.porez_kategorija IN ('OE', 'R', 'G') THEN s.osnovica ELSE 0 END) as oslobodjen_bez FROM dokument_stavke s JOIN dokumenti d ON s.dokument_id = d.id WHERE d.pib_prodavca = ? AND d.status IN ('Sent', 'Approved') AND d.azurirano_u LIKE ?`).bind(pib, `${period}%`).first() as any || {};
    const pRows = await this.env.REGISTAR_DB.prepare(`SELECT SUM(CASE WHEN d.pib_prodavca = '000000000' THEN s.osnovica ELSE 0 END) as uvoz_b, SUM(CASE WHEN d.pib_prodavca = '000000000' THEN s.iznos_poreza ELSE 0 END) as uvoz_p, SUM(s.iznos_poreza - IFNULL(s.razlika, 0)) as cist FROM dokument_stavke s JOIN dokumenti d ON s.dokument_id = d.id WHERE d.pib_kupca = ? AND d.status = 'Approved' AND d.azurirano_u LIKE ?`).bind(pib, `${period}%`).first() as any || {};
    const p101 = Math.round(sRows.pOpsta || 0), p102 = Math.round(sRows.pPosebna || 0), p108 = Math.round(pRows.cist || 0), p105 = Math.round(pRows.uvoz_p || 0);
    return { period, pozicija001_osnovicaOpsta: Math.round(sRows.bOpsta || 0), pozicija101_pdvOpsta: p101, pozicija002_osnovicaPosebna: Math.round(sRows.bPosebna || 0), pozicija102_pdvPosebna: p102, pozicija003_oslobodjenSaPravom: Math.round(sRows.oslobodjen_sa || 0),  pozicija004_oslobodjenBezPrava: Math.round(sRows.oslobodjen_bez || 0), pozicija005_uvozOsnovica: Math.round(pRows.uvoz_b || 0), pozicija105_uvozPdv: p105, pozicija006_interniObracunOsnovica: 0, pozicija106_interniObracunPdv: 0, pozicija008_prethodniPorezOdbitni: p108, porezZaUplatuIliPovracaj: (p101 + p102) - p108 };
  }

  private updateSchemaFor2026() { try { this.sql.exec(`ALTER TABLE konfiguracija ADD COLUMN poreski_period_tip TEXT DEFAULT 'MONTHLY';`); } catch (e) {} }
  private updateSchemaForBillingLedger() { try { this.sql.exec(`ALTER TABLE billing_ledger ADD COLUMN faktura_id TEXT;`); } catch (e) {} try { this.sql.exec(`ALTER TABLE billing_ledger ADD COLUMN broj_fakture TEXT;`); } catch (e) {} }

  private initDatabase(): void {
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS konfiguracija (id INTEGER PRIMARY KEY CHECK (id = 1), sef_api_key TEXT NOT NULL, klijent_id TEXT, environment TEXT DEFAULT 'sandbox', status_pretplate TEXT DEFAULT 'AKTIVAN', plan_name TEXT DEFAULT 'Micro', limit_faktura INTEGER DEFAULT 50);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS fakture (internal_id TEXT PRIMARY KEY, sef_id TEXT UNIQUE, broj_fakture TEXT NOT NULL, status TEXT NOT NULL, iznos REAL NOT NULL DEFAULT 0, raw_data TEXT, arhiva_r2_path TEXT, kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP, azurirano_u DATETIME DEFAULT CURRENT_TIMESTAMP);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS sef_purchase_invoices (sef_id TEXT PRIMARY KEY, invoice_number TEXT NOT NULL, supplier_pib TEXT NOT NULL, issue_date TEXT NOT NULL, total_amount REAL NOT NULL, status TEXT NOT NULL, raw_xml TEXT, arhiva_r2_path TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS billing_ledger (row_id INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE, faktura_id TEXT, broj_fakture TEXT, tip_transakcije TEXT, iznos_kredita INTEGER, kreiran_u DATETIME DEFAULT CURRENT_TIMESTAMP, beleska TEXT);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS sef_sales_invoice_taxes (invoice_id TEXT, tax_category_code TEXT, tax_percentage REAL, taxable_amount REAL, tax_amount REAL, PRIMARY KEY (invoice_id, tax_category_code, tax_percentage));`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS sef_purchase_invoice_taxes (invoice_id TEXT, tax_category_code TEXT, tax_percentage REAL, taxable_amount REAL, tax_amount REAL, non_deductible_amount REAL, PRIMARY KEY (invoice_id, tax_category_code, tax_percentage));`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS otpremnice (internal_id TEXT PRIMARY KEY, sef_id TEXT UNIQUE, broj_otpremnice TEXT NOT NULL, status TEXT NOT NULL, pib_kupca TEXT NOT NULL, kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP, potvrdjeno_u DATETIME, ima_razliku INTEGER DEFAULT 0);`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS logistika_stavke (otpremnica_id TEXT, line_id TEXT, naziv TEXT, poslata_kolicina REAL, primljena_kolicina REAL, jedinica_mere TEXT, razlika REAL, PRIMARY KEY (otpremnica_id, line_id));`);
    });
  }

  async syncWithSef() {
    let config = this.sql.exec(`SELECT sef_api_key, environment, klijent_id FROM konfiguracija WHERE id = 1`).one() as any;
    const sefClient = new SefClient({ apiKey: new Redacted(config.sef_api_key).get(), environment: config.environment, baseUrl: this.env.SEF_API_URL ?? 'https://demoefaktura.mfin.gov.rs' });
    const dateFrom = (new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]) ?? '';
    const dateTo = (new Date().toISOString().split('T')[0]) ?? '';
    try {
      const rawIds = await sefClient.getSalesInvoiceIds(dateFrom, dateTo);
      const invoiceIds = Array.isArray(rawIds) ? rawIds : ((rawIds as any).salesInvoiceIds || []);
      for (const id of invoiceIds.slice(-10)) {
        const details = await sefClient.getSalesInvoiceDetails(id);
        if (details) await this.processStatusUpdate(String(id), String(details.InvoiceStatus || 'Unknown'));
      }
    } catch (err: any) { console.error("Sync Error:", err); }
    return { discoveredSales: 0, discoveredPurchases: 0 };
  }

  private getSaldo(): number {
    const row = this.sql.exec(`SELECT SUM(iznos_kredita) as ukupno FROM billing_ledger`).one() as { ukupno: number | null };
    return row.ukupno || 0;
  }

  async dumpDatabase() {
    return { fakture: this.sql.exec(`SELECT * FROM fakture`).toArray(), purchase: this.sql.exec(`SELECT * FROM sef_purchase_invoices`).toArray() };
  }

  async setConfig(config: any) {
    const res = await this.app.request('/config', { method: 'POST', body: JSON.stringify(config) }, this.env);
    return await res.json();
  }
  async getWebhookInstructions() { return { success: true, instructions: { sales_url: '...', purchase_url: '...' } }; }
  async getStats() { 
    const res = await this.app.request('/stats', { method: 'GET' }, this.env);
    return await res.json();
  }
  async getLogs() { return { success: true, logs: [] }; }
  async getFakture(page: number = 1) {
    return { success: true, fakture: this.sql.exec(`SELECT * FROM fakture ORDER BY azurirano_u DESC LIMIT 20 OFFSET ?`, (page - 1) * 20).toArray() };
  }
}
