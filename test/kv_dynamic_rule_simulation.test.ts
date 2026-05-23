import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, beforeAll, vi, afterAll } from 'vitest';
import { app } from '../worker/index';
import { SefLiveValidator } from '../packages/sef-ubl-builder/src/index';

describe('Državni šok v3.6.0 — KV Dynamic Rule Simulation', () => {

  const klijentId = 'klijent_dynamic_shock';

  beforeAll(async () => {
    // Inicijalizacija baze
    await env.REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS klijenti (
        klijent_id TEXT PRIMARY KEY,
        naziv TEXT NOT NULL,
        ima_aktivne_fakture INTEGER DEFAULT 0,
        poslednji_sync DATETIME DEFAULT '1970-01-01 00:00:00',
        kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(async () => {
    // OKLOP: Očisti keš validatora u test memoriji
    SefLiveValidator.clearCache();

    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = env.KLIJENT_BAZA_OBJECT.get(doId);
    // OKLOP: Očisti keš i u Durable Object memoriji
    await klijentDO.fetch(new Request('http://do/internal/clear-cache', { method: 'POST' }));

    // 1. Resetuj KV
    await env.PORESKI_KV.delete("DRZAVNA_PORESKA_PRAVILA_RS");
    
    // 2. Resetuj D1
    await env.REGISTAR_DB.prepare("DELETE FROM klijenti").run();
    
    // 3. Registruj klijenta u D1
    await env.REGISTAR_DB.prepare("INSERT OR REPLACE INTO klijenti (klijent_id, naziv) VALUES (?, ?)")
      .bind(klijentId, 'Shock Test Firma').run();
  });

  it('Treba da reaguje na promenu roka u realnom vremenu (Step 1 & 2)', async () => {
    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = env.KLIJENT_BAZA_OBJECT.get(doId);
    
    // 1. Konfiguracija i blokada
    await klijentDO.fetch(new Request('http://do/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sef_api_key: 'test_key' })
    }));
// 2. Blokiraj pretplatu
await klijentDO.fetch(new Request('http://do/admin/set-status', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ status: 'BLOKIRAN' })
}));

    // Simuliramo datum: 11. Maj 2026.
    vi.setSystemTime(new Date('2026-05-11T10:00:00Z'));

    // --- SCENARIO 1: Rok je 12 ---
    await env.PORESKI_KV.put("DRZAVNA_PORESKA_PRAVILA_RS", JSON.stringify({
      ZAKONSKI_ROK_DANA: 12,
      OPSTA_STOPA_PDV: 20.00
    }));

    const invoiceData = {
      ID: "FAK-APRIL-1",
      IssueDate: "2026-04-30",
      DueDate: "2026-05-15",
      InvoiceTypeCode: "380",
      DocumentCurrencyCode: "RSD",
      Supplier: { Pib: "123456789", Name: "Test", Address: { City: "BG", CountryCode: "RS" } },
      Customer: { Pib: "987654321", Name: "Kupac", Address: { City: "BG", CountryCode: "RS" } },
      LegalMonetaryTotal: { 
        LineExtensionAmount: 100, TaxExclusiveAmount: 100, TaxInclusiveAmount: 120, 
        AllowanceTotalAmount: 0, PrepaidAmount: 0, PayableRoundingAmount: 0, PayableAmount: 120 
      },
      Lines: []
    };

    const mockCtx = {
      waitUntil: (p: Promise<any>) => p,
      passThroughOnException: () => {}
    };

    const res1 = await app.request('/api/fakture/send', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'X-Klijent-ID': klijentId,
        'X-Test-Now': new Date('2026-05-11T10:00:00Z').toISOString()
      },
      body: JSON.stringify(invoiceData)
    }, env, mockCtx as any);

    expect(res1.status).toBe(202);

    // --- SCENARIO 2: Rok se menja na 10 ---
    await env.PORESKI_KV.put("DRZAVNA_PORESKA_PRAVILA_RS", JSON.stringify({
      ZAKONSKI_ROK_DANA: 10,
      OPSTA_STOPA_PDV: 20.00
    }));
    
    // OKLOP: Dajemo Miniflare-u trenutak da propagira KV izmenu
    await new Promise(r => setTimeout(resolve => r(resolve), 100));

    const res2 = await app.request('/api/fakture/send', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'X-Klijent-ID': klijentId,
        'X-Test-Now': new Date('2026-05-11T10:00:00Z').toISOString()
      },
      body: JSON.stringify({ ...invoiceData, ID: "FAK-APRIL-2" })
    }, env, mockCtx as any);

    expect(res2.status).toBe(402);
    const body2 = await res2.json() as any;
    expect(body2.error).toBe("Pristup blokiran");
    expect(body2.poruka).toContain("10. u mesecu");
  });
});
