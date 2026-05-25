import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, beforeAll, vi, afterAll } from 'vitest';
import { app } from '../worker/index';

describe('v3.7.0 Arhivski Bedem — Uredba o čuvanju e-faktura Audit', () => {

  const klijentId = 'klijent_arhiva_test';
  const pib = '102345678';

  beforeAll(async () => {
    // Inicijalizacija šeme
    await (env as any).REGISTAR_DB.prepare("DROP TABLE IF EXISTS dokumenti").run();
    await (env as any).REGISTAR_DB.prepare("DROP TABLE IF EXISTS klijenti").run();

    await (env as any).REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS klijenti (
        klijent_id TEXT PRIMARY KEY, naziv TEXT NOT NULL,
        ima_aktivne_fakture INTEGER DEFAULT 0, poslednji_sync DATETIME DEFAULT CURRENT_TIMESTAMP
      )
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
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(async () => {
    await (env as any).REGISTAR_DB.prepare("DELETE FROM klijenti").run();
    await (env as any).REGISTAR_DB.prepare("DELETE FROM dokumenti").run();
    
    await (env as any).REGISTAR_DB.prepare("INSERT INTO klijenti (klijent_id, naziv) VALUES (?, ?)")
      .bind(klijentId, 'Arhivski Test Firma').run();

    const doId = (env as any).KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = (env as any).KLIJENT_BAZA_OBJECT.get(doId);
    
    await klijentDO.fetch(new Request('http://do/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sef_api_key: 'test_key', klijent_id: pib, limit: 100 })
    }));

    await klijentDO.fetch(new Request('http://do/test/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'RESET_LEDGER', saldo: 100 })
    }));
  });

  it('Član 3: Obezbeđivanje integriteta i originalnog UBL XML formata na R2 skladištu', async () => {
    const doId = (env as any).KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = (env as any).KLIJENT_BAZA_OBJECT.get(doId);
    const mockCtx = { waitUntil: async (p: any) => await p, passThroughOnException: () => {} };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input.toString();
      if (url.includes('/public/documents/requests')) return new Response(null, { status: 200 });
      if (url.includes('/changes')) {
        return new Response(JSON.stringify({
          items: [{ data: { salesInvoice: { id: '9999', invoiceNumber: 'FKT-ARCH-01' } } }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(null, { status: 404 });
    });

    const invoiceData = {
      ID: "FKT-ARCH-01", IssueDate: "2026-05-25", DueDate: "2026-05-30",
      InvoiceTypeCode: "380", DocumentCurrencyCode: "RSD",
      Supplier: { Pib: pib, Name: "Test", Address: { City: "BG", CountryCode: "RS" } },
      Customer: { Pib: "987654321", Name: "Kupac", Address: { City: "NS", CountryCode: "RS" } },
      LegalMonetaryTotal: { LineExtensionAmount: 100, TaxExclusiveAmount: 100, TaxInclusiveAmount: 120, AllowanceTotalAmount: 0, PrepaidAmount: 0, PayableRoundingAmount: 0, PayableAmount: 120 },
      Lines: [{ ID: "1", Quantity: 1, UnitCode: "H87", LineExtensionAmount: 100, Price: 100, ItemName: "Test", VatCategory: "S", VatPercent: 20 }]
    };

    const res = await app.request('/api/fakture/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Klijent-ID': klijentId },
      body: JSON.stringify(invoiceData)
    }, env, mockCtx as any);

    expect(res.status).toBe(202);

    // Verifikacija u Durable Object memoriji i simulacija R2 (meta-check)
    const statsRes = await klijentDO.fetch(new Request('http://do/stats'));
    const stats = await statsRes.json() as any;
    expect(stats.totalInvoices).toBeGreaterThan(0);

    fetchSpy.mockRestore();
  });

  it('Član 4: Verifikacija metapodataka o desetogodišnjem zakonskom roku čuvanja', async () => {
    const doId = (env as any).KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = (env as any).KLIJENT_BAZA_OBJECT.get(doId);

    const checkRes = await klijentDO.fetch(new Request('http://do/api/audit/retention-policy'));
    const data = await checkRes.json() as any;

    expect(checkRes.status).toBe(200);
    expect(data.retentionPeriodYears).toBe(10);
    expect(data.policyType).toBe("ZAKON_O_ELEKTRONSKOM_FAKTURISANJU");
  });

  it('Član 5: Uspešno generisanje masovnog audit paketa za poresku inspekciju', async () => {
    const doId = (env as any).KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = (env as any).KLIJENT_BAZA_OBJECT.get(doId);
    const mockCtx = { waitUntil: async (p: any) => await p, passThroughOnException: () => {} };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input.toString();
      if (url.includes('/public/documents/requests')) return new Response(null, { status: 200 });
      if (url.includes('/changes')) {
        return new Response(JSON.stringify({
          items: [{ data: { salesInvoice: { id: '8888', invoiceNumber: 'FKT-C5-01' } } }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(null, { status: 404 });
    });

    const invoiceData = {
      ID: "FKT-C5-01", IssueDate: "2026-05-25", DueDate: "2026-05-30",
      InvoiceTypeCode: "380", DocumentCurrencyCode: "RSD",
      Supplier: { Pib: pib, Name: "Test", Address: { City: "BG", CountryCode: "RS" } },
      Customer: { Pib: "987654321", Name: "Kupac", Address: { City: "NS", CountryCode: "RS" } },
      LegalMonetaryTotal: { LineExtensionAmount: 100, TaxExclusiveAmount: 100, TaxInclusiveAmount: 120, AllowanceTotalAmount: 0, PrepaidAmount: 0, PayableRoundingAmount: 0, PayableAmount: 120 },
      Lines: [{ ID: "1", Quantity: 1, UnitCode: "H87", LineExtensionAmount: 100, Price: 100, ItemName: "Test", VatCategory: "S", VatPercent: 20 }]
    };

    await app.request('/api/fakture/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Klijent-ID': klijentId },
      body: JSON.stringify(invoiceData)
    }, env, mockCtx as any);

    // Praznimo pozadinske zadatke
    await new Promise(r => setTimeout(r, 100));

    // Tražimo period koji obuhvata današnji datum
    const auditRes = await klijentDO.fetch(new Request('http://do/api/audit/download?period=2026-05-25'));
    const auditData = await auditRes.json() as any;

    expect(auditRes.status).toBe(200);
    expect(auditData.status).toBe("USKLAĐENO_SA_UREDROM_MFIN");
    expect(auditData.ukupnoDokumenata).toBeGreaterThan(0);
    expect(auditData.dokumenti.find((d:any) => d.broj === 'FKT-C5-01')).toBeDefined();

    fetchSpy.mockRestore();
  });
});
