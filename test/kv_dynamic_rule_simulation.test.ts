import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, beforeAll, vi, afterAll } from 'vitest';
import { app } from '../packages/backend/src/index';
import { SefLiveValidator } from '@sef/shared/compliance/validator';

describe('Državni šok v3.6.0 — KV Dynamic Rule Simulation', () => {

  const klijentId = 'klijent_shock_pib';

  beforeAll(async () => {
    // Čišćenje i re-inicijalizacija
    await (env as any).REGISTAR_DB.prepare("DROP TABLE IF EXISTS dokumenti").run();
    await (env as any).REGISTAR_DB.prepare("DROP TABLE IF EXISTS dokument_stavke").run();
    await (env as any).REGISTAR_DB.prepare("DROP TABLE IF EXISTS dokumenti_log").run();
    await (env as any).REGISTAR_DB.prepare("DROP TABLE IF EXISTS klijenti").run();

    await (env as any).REGISTAR_DB.prepare(`
       CREATE TABLE IF NOT EXISTS klijenti (klijent_id TEXT PRIMARY KEY, naziv TEXT NOT NULL)
    `).run();

    await (env as any).REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS dokumenti (
        id TEXT PRIMARY KEY,
        sef_id TEXT UNIQUE,
        tip TEXT NOT NULL,
        broj TEXT NOT NULL,
        pib_prodavca TEXT NOT NULL,
        pib_kupca TEXT NOT NULL,
        status TEXT NOT NULL,
        iznos_osnovica REAL DEFAULT 0,
        iznos_poreza REAL DEFAULT 0,
        datum_prometa DATETIME,
        xml_blob TEXT,
        json_metadata TEXT,
        parent_id TEXT,
        kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP,
        azurirano_u DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await (env as any).REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS dokument_stavke (
        id INTEGER PRIMARY KEY AUTOINCREMENT, dokument_id TEXT NOT NULL, line_id TEXT,
        naziv TEXT NOT NULL, poslata_kolicina REAL, primljena_kolicina REAL,
        jedinica_mere TEXT, cena REAL, porez_stopa REAL, porez_kategorija TEXT,
        osnovica REAL, iznos_poreza REAL, razlika REAL,
        akcizna_kategorija TEXT, akcizna_gustina REAL, izvorna_stavka_id TEXT,
        UNIQUE(dokument_id, line_id)
      )
    `).run();
    await (env as any).REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS dokumenti_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, dokument_id TEXT NOT NULL,
        prethodni_status TEXT, novi_status TEXT NOT NULL, poruka TEXT,
        kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(dokument_id) REFERENCES dokumenti(id)
      )
    `).run();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(async () => {
    // 1. Očisti keš validatora
    SefLiveValidator.clearCache();

    const doId = (env as any).KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = (env as any).KLIJENT_BAZA_OBJECT.get(doId);
    
    // 2. Resetuj DO keš i ledger
    await klijentDO.fetch(new Request('http://do/internal/clear-cache', { method: 'POST' }));
    await klijentDO.fetch(new Request('http://do/test/seed', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'RESET_LEDGER', saldo: 100 }) 
    }));
    // 3. Resetuj KV
    await (env as any).PORESKI_KV.delete("DRZAVNA_PORESKA_PRAVILA_RS");
    
    // 4. Resetuj D1
    await (env as any).REGISTAR_DB.prepare("DELETE FROM klijenti").run();
    await (env as any).REGISTAR_DB.prepare("DELETE FROM dokumenti").run();
    await (env as any).REGISTAR_DB.prepare("DELETE FROM dokument_stavke").run();
    
    // 5. Registruj klijenta u D1
    await (env as any).REGISTAR_DB.prepare("INSERT OR REPLACE INTO klijenti (klijent_id, naziv) VALUES (?, ?)")
      .bind(klijentId, 'Shock Test Firma').run();

    // 6. Konfiguracija DO
    await klijentDO.fetch(new Request('http://do/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sef_api_key: 'shock_key', status_pretplate: 'BLOKIRAN' })
    }));
  });

  it('Treba da reaguje na promenu roka u realnom vremenu (Header Injection)', async () => {
    // --- SCENARIO 1: Zakonski rok je 12 dana ---
    await (env as any).PORESKI_KV.put("DRZAVNA_PORESKA_PRAVILA_RS", JSON.stringify({
      ZAKONSKI_ROK_DANA: 12,
      OPSTA_STOPA_PDV: 20.00
    }));

    const invoiceData1 = {
      ID: "FAK-APRIL-1",
      IssueDate: "2026-04-30",
      DueDate: "2026-05-15",
      InvoiceTypeCode: "380",
      DocumentCurrencyCode: "RSD",
      Supplier: { Pib: "123456789", Name: "Prodavac", Address: { City: "BG", CountryCode: "RS" } },
      Customer: { Pib: "987654321", Name: "Kupac", Address: { City: "NS", CountryCode: "RS" } },
      LegalMonetaryTotal: { LineExtensionAmount: 100, TaxExclusiveAmount: 100, TaxInclusiveAmount: 120, AllowanceTotalAmount: 0, PrepaidAmount: 0, PayableRoundingAmount: 0, PayableAmount: 120 },
      Lines: [{ ID: "1", Quantity: 1, UnitCode: "H87", LineExtensionAmount: 100, Price: 100, ItemName: "Usluga", VatCategory: "S", VatPercent: 20 }]
    };

    const datumUnutarRoka = '2026-05-12T10:00:00Z'; // 12 dana od kraja aprila je OK
    const mockCtx = { waitUntil: () => {}, passThroughOnException: () => {} };

    const res1 = await app.request('/api/fakture/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Klijent-ID': klijentId, 'X-Test-Now': datumUnutarRoka },
      body: JSON.stringify(invoiceData1)
    }, env, mockCtx as any);

    if (res1.status === 400) {
      console.log("SHOCK ERROR 1:", await res1.text());
    }

    expect(res1.status).toBe(202);

    // --- SCENARIO 2: Zakonski rok se menja na 10 dana (REAL-TIME SHOCK) ---
    await (env as any).PORESKI_KV.put("DRZAVNA_PORESKA_PRAVILA_RS", JSON.stringify({
      ZAKONSKI_ROK_DANA: 10,
      OPSTA_STOPA_PDV: 20.00
    }));
    SefLiveValidator.clearCache(); // Force refresh from KV

    const res2 = await app.request('/api/fakture/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Klijent-ID': klijentId, 'X-Test-Now': datumUnutarRoka },
      body: JSON.stringify(invoiceData1)
    }, env, mockCtx as any);

    // Očekujemo odbijanje (400) jer je sada 12. maj, a rok je bio 10. maj (30. april + 10 dana)
    expect(res2.status).toBe(400);
    const errorData = await res2.json() as any;
    expect(errorData.error).toContain("ZAKONSKI_ROK_PREKORAČEN");
  });
});
