import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, beforeAll, vi, afterAll } from 'vitest';
import { app } from '../packages/backend/src/index';

describe('SEF Bridge v3.6.0 — Krovni E2E Smoke Test i Verifikacija Lanaca (Poreski Kvantni Skok)', () => {

  const klijentId = 'klijent_113398540'; // mora se podudarati sa webhook DO lookup-om: klijent_{pibKupca}
  const pibProdavca = '101134702';
  const pibKupca = '113398540';

  beforeAll(async () => {
    // Inicijalizacija registar tabele u D1 (SSoT)
    await (env as any).REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS klijenti (
        klijent_id TEXT PRIMARY KEY, naziv TEXT, poslednji_sync DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await (env as any).REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS dokumenti (
        id TEXT PRIMARY KEY, sef_id TEXT, tip TEXT, broj TEXT, pib_prodavca TEXT, pib_kupca TEXT, status TEXT, 
        iznos_osnovica REAL, iznos_poreza REAL, datum_prometa TEXT, xml_blob TEXT, json_metadata TEXT, parent_id TEXT, 
        kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP, azurirano_u DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await (env as any).REGISTAR_DB.prepare(`
      INSERT INTO klijenti (klijent_id, naziv, poslednji_sync) 
      VALUES (?, 'Smoke Test DOO', CURRENT_TIMESTAMP)
      ON CONFLICT(klijent_id) DO UPDATE SET poslednji_sync = CURRENT_TIMESTAMP
    `).bind(klijentId).run();

    const doId = (env as any).KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = (env as any).KLIJENT_BAZA_OBJECT.get(doId);
    
    await klijentDO.fetch(new Request('http://do/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sef_api_key: 'smoke_key', plan: 'Plus', limit: 500 })
    }));

    await klijentDO.fetch(new Request('http://do/test/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'RESET_LEDGER', saldo: 100 })
    }));
  });

  afterAll(async () => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
  });

  it('Kompletan ciklus: Validacija ➔ Rezervacija ➔ Webhook Refundacija ➔ e-Porezi TXT Export', async () => {
    const mockCtx = { waitUntil: (p: Promise<any>) => p };
    
    // 🚀 1. PURE SEF PAYLOAD (Direct Standard)
    const izlaznaFaktura = {
      id: 'FKT-2026-OE-01',
      invoiceTypeCode: '380',
      issueDate: '2026-05-26',
      paymentDueDate: '2026-06-10',
      pibS: pibProdavca,
      pibB: pibKupca,
      payableAmount: 150000,
      lineExtensionAmount: 150000,
      taxExclusiveAmount: 150000,
      taxInclusiveAmount: 150000,
      taxTotals: [
        {
          taxAmount: 0,
          taxSchemeId: 'VAT',
          subtotals: [
            { taxableAmount: 150000, taxAmount: 0, taxCategoryCode: 'OE', taxCategoryPercent: 0 }
          ]
        }
      ],
      invoiceLines: [
        {
          id: '1',
          name: 'Usluga OE',
          invoicedQuantity: 1,
          unitCode: 'HUR',
          priceAmount: 150000,
          lineExtensionAmount: 150000,
          classifiedTaxCategory: { taxCategoryCode: 'OE', taxCategoryPercent: 0, taxSchemeId: 'VAT' }
        }
      ]
    };

    // 2. SLANJE NA BACKEND
    const sendRes = await app.request('/api/fakture/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Klijent-ID': klijentId },
      body: JSON.stringify(izlaznaFaktura)
    }, env, mockCtx as any);

    if (sendRes.status !== 202) {
      console.log('SEND_FAIL:', await sendRes.text());
    }

    expect(sendRes.status).toBe(202);

    // 3. PROVERA POTROŠNJE (Mora biti -1)
    await new Promise(r => setTimeout(r, 100));
    const analyticsRes = await app.request('/api/analytics/potrosnja', {
      headers: { 'X-Klijent-ID': klijentId }
    }, env);
    const analytics = await analyticsRes.json() as any;
    expect(analytics.preostalo).toBe(99);

    // 4. SIMULACIJA WEBHOOK-A (Država odbija fakturu -> Refundacija)
    const webhookPayload = {
      pibKupca: pibKupca,
      faktura_id: 'SEF-ID',
      status: 'Rejected',
      brojFakture: 'FKT-2026-OE-01'
    };

    const webhookRes = await app.request('/api/webhooks/sef-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload)
    }, env);

    expect(webhookRes.status).toBe(200);

    // 5. FINALNA VERIFIKACIJA SALDA (Mora se vratiti na 100)
    const finalAnalyticsRes = await app.request('/api/analytics/potrosnja', {
      headers: { 'X-Klijent-ID': klijentId }
    }, env);
    const finalAnalytics = await finalAnalyticsRes.json() as any;
    expect(finalAnalytics.preostalo).toBe(100);
  });
});
