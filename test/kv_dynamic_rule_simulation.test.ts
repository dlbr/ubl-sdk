import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { app } from '../worker/index';
import { SefLiveValidator } from '@dlbr/ubl-sdk';

describe('Državni šok v3.6.0 — KV Dynamic Rule Simulation', () => {

  const klijentId = 'klijent_dynamic_shock';

  beforeAll(async () => {
    // Inicijalizacija baze (centralne)
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

  beforeEach(async () => {
    // 1. Očisti keš validatora
    SefLiveValidator.clearCache();

    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = env.KLIJENT_BAZA_OBJECT.get(doId);
    
    // 2. Resetuj DO keš i ledger
    await klijentDO.fetch(new Request('http://do/internal/clear-cache', { method: 'POST' }));
    await klijentDO.fetch(new Request('http://do/test/seed', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'RESET_LEDGER', saldo: 100 }) 
    }));
    // 3. Resetuj KV
    await env.PORESKI_KV.delete("DRZAVNA_PORESKA_PRAVILA_RS");
    
    // 4. Resetuj D1
    await env.REGISTAR_DB.prepare("DELETE FROM klijenti").run();
    
    // 5. Registruj klijenta u D1
    await env.REGISTAR_DB.prepare("INSERT OR REPLACE INTO klijenti (klijent_id, naziv) VALUES (?, ?)")
      .bind(klijentId, 'Shock Test Firma').run();
  });

  it('Treba da reaguje na promenu roka u realnom vremenu (Header Injection)', async () => {
    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = env.KLIJENT_BAZA_OBJECT.get(doId);
    
    // 1. Konfiguracija i blokada
    await klijentDO.fetch(new Request('http://do/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sef_api_key: 'test_key' })
    }));
    
    await klijentDO.fetch(new Request('http://do/admin/set-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'BLOKIRAN' })
    }));

    // --- SCENARIO 1: Zakonski rok je 12 dana ---
    await env.PORESKI_KV.put("DRZAVNA_PORESKA_PRAVILA_RS", JSON.stringify({
      ZAKONSKI_ROK_DANA: 12,
      OPSTA_STOPA_PDV: 20.00
    }));

    // Compliant SefInvoiceSchema data
    const invoiceData1 = {
      ID: "FAK-APRIL-1",
      IssueDate: "2026-04-30",
      DueDate: "2026-05-15",
      InvoiceTypeCode: "380",
      DocumentCurrencyCode: "RSD",
      Supplier: { 
        Pib: "123456789", Name: "Prodavac", 
        Address: { City: "Beograd", CountryCode: "RS" } 
      },
      Customer: { 
        Pib: "987654321", Name: "Kupac", 
        Address: { City: "Novi Sad", CountryCode: "RS" } 
      },
      LegalMonetaryTotal: {
        LineExtensionAmount: 100,
        TaxExclusiveAmount: 100,
        TaxInclusiveAmount: 120,
        AllowanceTotalAmount: 0,
        PrepaidAmount: 0,
        PayableRoundingAmount: 0,
        PayableAmount: 120,
      },
      Lines: [{
        ID: "1",
        Quantity: 1,
        UnitCode: "H87",
        LineExtensionAmount: 100,
        Price: 100,
        ItemName: "Usluga",
        VatCategory: "S",
        VatPercent: 20
      }]
    };

    const mockCtx = {
      waitUntil: (p: Promise<any>) => p,
      passThroughOnException: () => {}
    };

    const testNow = '2026-05-11T10:00:00Z'; // 11. maj je <= 12 dana od 30. aprila

    // Očekujemo USPEH (202 Accepted)
    const res1 = await app.fetch(new Request('http://localhost/api/fakture/send', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'X-Klijent-ID': klijentId,
        'X-Test-Now': testNow
      },
      body: JSON.stringify(invoiceData1)
    }), env, mockCtx as any);

    if (res1.status === 400) {
      console.log("SDK ERROR:", await res1.text());
    }
    expect(res1.status).toBe(202);

    // --- SCENARIO 2: Zakonski rok se menja na 10 dana (REAL-TIME SHOCK) ---
    await env.PORESKI_KV.put("DRZAVNA_PORESKA_PRAVILA_RS", JSON.stringify({
      ZAKONSKI_ROK_DANA: 10,
      OPSTA_STOPA_PDV: 20.00
    }));
    
    // Očisti keš u DO da bi pokupio nova pravila
    await klijentDO.fetch(new Request('http://do/internal/clear-cache', { method: 'POST' }));

    const invoiceData2 = { ...invoiceData1, ID: "FAK-APRIL-2" };

    // Test Now: 11. Maj (izvan roka od 10 dana)
    const res2 = await app.fetch(new Request('http://localhost/api/fakture/send', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'X-Klijent-ID': klijentId,
        'X-Test-Now': testNow
      },
      body: JSON.stringify(invoiceData2)
    }), env, mockCtx as any);

    expect(res2.status).toBe(403);
    const body2 = await res2.json() as any;
    expect(body2.error).toBe("Pristup blokiran");
    expect(body2.message).toContain("Prošao rok od 10 dana");
  });
});
