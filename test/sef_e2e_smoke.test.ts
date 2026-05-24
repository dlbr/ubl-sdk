import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, beforeAll, vi, afterAll } from 'vitest';
import { app } from '../worker/index';
import { SefPppdvExporter } from '../shared/services/pppdvExporter';

describe('SEF Bridge v3.6.0 — Krovni E2E Smoke Test i Verifikacija Lanaca (Poreski Kvantni Skok)', () => {

  const klijentId = 'klijent_smoke_test';
  const pib = '102345678';

  beforeAll(async () => {
    vi.setSystemTime(new Date('2026-05-21T12:00:00Z'));
    // 1. Inicijalizacija centralne baze
    await env.REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS klijenti (
        klijent_id TEXT PRIMARY KEY, naziv TEXT NOT NULL,
        ima_aktivne_fakture INTEGER DEFAULT 0, poslednji_sync DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(async () => {
    // 1. Inicijalizacija D1 centralne baze (SSoT)
    await env.REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS dokumenti (
        id TEXT PRIMARY KEY, tip TEXT NOT NULL, broj TEXT NOT NULL,
        pib_prodavca TEXT NOT NULL, pib_kupca TEXT NOT NULL, status TEXT NOT NULL,
        xml_blob TEXT, json_metadata TEXT, parent_doc_id TEXT,
        kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP, azurirano_u DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS dokument_stavke (
        id INTEGER PRIMARY KEY AUTOINCREMENT, dokument_id TEXT NOT NULL, line_id TEXT,
        naziv TEXT NOT NULL, poslata_kolicina REAL, primljena_kolicina REAL,
        jedinica_mere TEXT, cena REAL, porez_stopa REAL, porez_kategorija TEXT,
        osnovica REAL, iznos_poreza REAL, razlika REAL
      )
    `).run();

    // 2. Čisto stanje pre svakog testa
    await env.REGISTAR_DB.prepare("DELETE FROM klijenti").run();
    await env.REGISTAR_DB.prepare("DELETE FROM dokumenti").run();
    await env.REGISTAR_DB.prepare("DELETE FROM dokument_stavke").run();
    await env.REGISTAR_DB.prepare("INSERT INTO klijenti (klijent_id, naziv) VALUES (?, ?)")      .bind(klijentId, 'E2E Smoke Firma').run();

    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = env.KLIJENT_BAZA_OBJECT.get(doId);
    
    // 3. Konfiguracija klijenta sa startnim limitom (500)
    await klijentDO.fetch(new Request('http://do/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sef_api_key: 'test_key', klijent_id: pib, limit: 500, environment: 'sandbox' })
    }));
  });

  it('Kompletan ciklus: Validacija ➔ Rezervacija ➔ Webhook Refundacija ➔ e-Porezi TXT Export', async () => {
    // Mock fetch za SEF API kako bi invoice otišao u 'Sent' status i dobio sef_id
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (req: Request | string | URL, init?: RequestInit) => {
      const urlStr = typeof req === 'string' ? req : (req instanceof URL ? req.toString() : req.url);
      if (urlStr.includes('/sales-invoice/ubl')) {
        return new Response(JSON.stringify({ SalesInvoiceId: 99999, InvoiceNumber: 'FKT-2026-OE-01' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(req, init);
    };

    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = env.KLIJENT_BAZA_OBJECT.get(doId);
    const mockCtx = { waitUntil: async (p: any) => await p, passThroughOnException: () => {} };

    // ---------------------------------------------------------
    // KORAK 1: ERP ŠALJE IZLAZNU FAKTURU (Kategorija OE - Oslobođenje bez prava odbitka)
    // ---------------------------------------------------------
    const izlaznaFaktura = {
      ID: "FKT-2026-OE-01",
      IssueDate: "2026-05-15",
      DueDate: "2026-05-30",
      InvoiceTypeCode: "380",
      DocumentCurrencyCode: "RSD",
      Supplier: { Pib: pib, Name: "Test", Address: { City: "BG", CountryCode: "RS" } },
      Customer: { Pib: "987654321", Name: "Kupac", Address: { City: "NS", CountryCode: "RS" } },
      LegalMonetaryTotal: { 
        LineExtensionAmount: 150000.00, TaxExclusiveAmount: 150000.00, TaxInclusiveAmount: 150000.00, 
        AllowanceTotalAmount: 0, PrepaidAmount: 0, PayableRoundingAmount: 0, PayableAmount: 150000.00 
      },
      TaxTotals: [{
        TaxAmount: 0,
        Subtotals: [{ TaxableAmount: 150000.00, TaxAmount: 0, Category: 'OE', Percent: 0 }]
      }],
      Lines: [{
        ID: "L1", Quantity: 1, UnitCode: "H87", LineExtensionAmount: 150000.00, Price: 150000.00, ItemName: "Usluga OE", VatCategory: 'OE', VatPercent: 0
      }]
    };

    const sendRes = await app.request('/api/fakture/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Klijent-ID': klijentId },
      body: JSON.stringify(izlaznaFaktura)
    }, env, mockCtx as any);

    expect(sendRes.status).toBe(202);

    // Oklop: Čekamo da asinhroni processQueue završi slanje ka mock-ovanom SEF-u i ažurira sef_id na 99999
    await new Promise(r => setTimeout(r, 500));

    // Verifikacija legera nakon slanja (500 - 1 = 499)
    let analyticsRes = await klijentDO.fetch(new Request('http://do/api/analytics/potrosnja'));
    let analytics = await analyticsRes.json() as any;
    expect(analytics.saldo).toBe(499);
    expect(analytics.izvod[0].tip_transakcije).toBe('POTROŠNJA');

    // ---------------------------------------------------------
    // KORAK 2: KNJIGOVOĐA UNOSI UVOZ ROBA (Pozicija 005/105)
    // ---------------------------------------------------------
    // Koristimo backdoor rutu da precizno inicijalizujemo purchase invoice sa PIB-om 000000000 
    // što simulira državni carinski račun za e-Porezi logiku
    await klijentDO.fetch(new Request('http://do/test/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        action: 'SEED_IMPORT',
        sefId: 'IMPORT-001',
        invoiceNumber: 'CARINA-26',
        issueDate: '2026-05-18T10:00:00Z',
        totalAmount: 45230.80,
        taxableAmount: 0,
        taxAmount: 45230.80
      })
    }));

    // Slično kao i kod uvoza, pošto se procesiranje reda dešava asinhrono a mockujemo SEF API, 
    // faktura možda nije ažurirala svoj sef_id. Da bismo bili sigurni da će export povući podatke, 
    // pozivamo interni endpoint za ekstrakciju analitike ako je potrebno, ali naš POST /fakture/send to već radi.

    // ---------------------------------------------------------
    // KORAK 3: KUPAC ODOBRAVA FAKTURU — STIŽE DRŽAVNI WEBHOOK (Status: Approved)
    // Ovo je neophodno da bi faktura ušla u e-Porezi obračun
    // ---------------------------------------------------------
    // Pošto smo mockovali fetch, faktura je dobila sef_id 99999
    await klijentDO.fetch(new Request('http://do/webhooks/sef-update?smer=SALES', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faktura_id: "99999", novi_status: 'Approved' })
    }));

    // ---------------------------------------------------------
    // KORAK 4: GENERISANJE FINALNOG TXT EKSPORTA ZA E-POREZI
    // ---------------------------------------------------------
    
    // Povlačenje summary-a iz sistema (obuhvata samo našu OE fakturu jer uvoz nismo mogli lako seedovati u DO)
    const exportRes = await klijentDO.fetch(new Request('http://do/api/analytics/pppdv-summary?period=2026-05'));
    const realSummaryResponse = await exportRes.json() as any;
    const realSummary = realSummaryResponse.data;

    expect(realSummary.pozicija004_oslobodjenBezPrava).toBe(150000); // 150k iz OE fakture
    expect(realSummary.porezZaUplatuIliPovracaj).toBe(-45231); // 0 obračunato - 45231 iz uvoza

    // Oklopno testiranje SefPppdvExporter formata sa fiksiranim, potpunim podacima (Simulacija svih vrsta)
    const fullSummary = {
      period: '2026-05',
      pozicija001_osnovicaOpsta: 0,
      pozicija101_pdvOpsta: 0,
      pozicija002_osnovicaPosebna: 0,
      pozicija102_pdvPosebna: 0,
      pozicija003_oslobodjenSaPravom: 0,
      pozicija004_oslobodjenBezPrava: 150000,
      pozicija005_uvozOsnovica: 0,
      pozicija105_uvozPdv: 45231, // Uvoz PDV
      pozicija006_interniObracunOsnovica: 0,
      pozicija106_interniObracunPdv: 0,
      pozicija008_prethodniPorezOdbitni: 0,
      porezZaUplatuIliPovracaj: 0
    };

    const pppdvTxt = SefPppdvExporter.generateTxt(pib, fullSummary);

    // Pipe-Delimited Oklop
    expect(pppdvTxt).toContain(`H|1.0|PPPDV|${pib}|2026-05-01|2026-05-31`);
    expect(pppdvTxt).toContain("D|004|150000");
    expect(pppdvTxt).toContain("D|105|45231");

    // ---------------------------------------------------------
    // KORAK 5: KUPAC (ILI SISTEM) KASNIJE ODBIJA FAKTURU — REFUNDACIJA
    // ---------------------------------------------------------
    await klijentDO.fetch(new Request('http://do/webhooks/sef-update?smer=SALES', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faktura_id: "99999", novi_status: 'Rejected' })
    }));

    // Verifikacija legera nakon refundacije (499 + 1 = 500)
    analyticsRes = await klijentDO.fetch(new Request('http://do/api/analytics/potrosnja'));
    analytics = await analyticsRes.json() as any;
    expect(analytics.saldo).toBe(500);
    expect(analytics.izvod[0].tip_transakcije).toBe('REFUNDACIJA');

    console.log("=============================================================");
    console.log("   🏁 KROVNI SMOKE TEST USPEŠNO IZVRŠEN BEZ IJedne GREŠKE   ");
    console.log("=============================================================");

    globalThis.fetch = originalFetch; // Restore fetch
  });
});
