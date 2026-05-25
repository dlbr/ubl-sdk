import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, beforeAll, vi, afterEach } from 'vitest';
import { app } from '../packages/backend/src/index';
import { D1SyncBridge } from '@sef/shared/services/D1SyncBridge';

// Pomoćna funkcija koja trenutno prazni mikro-zadatke iz V8 event loop-a
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('eOtpremnica E2E - Supply Chain State Machine', () => {

  const klijentId = 'klijent_otpremnice_test';
  const pibProdavca = '123456789';
  const pibKupca = '987654321';

  beforeAll(async () => {
    // Inicijalizacija centralne baze (D1)
    await (env as any).REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS dokumenti (
        id TEXT PRIMARY KEY, sef_id TEXT UNIQUE, tip TEXT NOT NULL, broj TEXT NOT NULL,
        pib_prodavca TEXT NOT NULL, pib_kupca TEXT NOT NULL, status TEXT NOT NULL,
        iznos_osnovica REAL DEFAULT 0, iznos_poreza REAL DEFAULT 0, datum_prometa DATETIME,
        xml_blob TEXT, json_metadata TEXT, parent_id TEXT,
        kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP, azurirano_u DATETIME DEFAULT CURRENT_TIMESTAMP
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

    await (env as any).REGISTAR_DB.prepare(`
       CREATE TABLE IF NOT EXISTS klijenti (klijent_id TEXT PRIMARY KEY, naziv TEXT NOT NULL)
    `).run();
  });

  beforeEach(async () => {
    vi.useRealTimers();

    // Čistimo tabele pre svakog testa
    await (env as any).REGISTAR_DB.prepare("DELETE FROM dokumenti_log").run();
    await (env as any).REGISTAR_DB.prepare("DELETE FROM dokument_stavke").run();
    await (env as any).REGISTAR_DB.prepare("DELETE FROM dokumenti").run();
    await (env as any).REGISTAR_DB.prepare("DELETE FROM klijenti").run();
    
    await (env as any).REGISTAR_DB.prepare("INSERT INTO klijenti (klijent_id, naziv) VALUES (?, ?)")
      .bind(klijentId, 'Logistička Firma DOO').run();

    const doId = (env as any).KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = (env as any).KLIJENT_BAZA_OBJECT.get(doId);
    
    await klijentDO.fetch(new Request('http://do/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sef_api_key: 'test_key', klijent_id: pibProdavca, limit: 100 })
    }));

    await klijentDO.fetch(new Request('http://do/test/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'RESET_LEDGER', saldo: 100 })
    }));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // 🚨 KRIZNA RAMPA: Nakon svakog testa prisilno praznimo sve zaostale Promise-e iz pozadine
    await flushPromises();
  });

  it('Treba uspešno poslati otpremnicu i zabilježiti je u D1 SSoT', async () => {
    const otpremnicaData = {
      id: "OTP-2026-X1",
      issueDate: "2026-05-24",
      despatchDate: "2026-05-24",
      supplierPib: pibProdavca,
      customerPib: pibKupca,
      lines: [
        { id: "1", name: "Šljunak", quantity: 10, unitCode: "TNE" },
        { id: "2", name: "Cement", quantity: 50, unitCode: "KGM" }
      ]
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input.toString();
      if (url.includes('/public/documents/requests')) {
        return new Response(null, { status: 200 });
      }
      if (url.includes('/public/documents/suppliers/changes') || url.includes('/changes')) {
        return new Response(JSON.stringify({
          items: [{ data: { despatchAdvice: { id: '9999', documentNumber: 'OTP-2026-X1' } } }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const res = await app.request('/api/otpremnice/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Klijent-ID': klijentId },
      body: JSON.stringify(otpremnicaData)
    }, env);

    expect(res.status).toBe(202);
    const result = await res.json() as any;
    expect(result.success).toBe(true);
    const internalId = result.internalId;

    // Kratka pauza da dozvolimo lokalni upis
    await flushPromises();

    const doc = await (env as any).REGISTAR_DB.prepare("SELECT * FROM dokumenti WHERE id = ?").bind(internalId).first() as any;
    expect(doc).toBeDefined();
    expect(doc.tip).toBe('OTPREMNICA');
    expect(doc.broj).toBe('OTP-2026-X1');

    const log = await (env as any).REGISTAR_DB.prepare("SELECT * FROM dokumenti_log WHERE dokument_id = ?").bind(internalId).first() as any;
    expect(log).toBeDefined();

    const stavke = await (env as any).REGISTAR_DB.prepare("SELECT * FROM dokument_stavke WHERE dokument_id = ?").bind(internalId).all();
    expect(stavke.results.length).toBe(2);
  });

  it('Treba ispravno povezati Otpremnicu i Fakturu u D1 bazi i rekonstruisati lanac', async () => {
    const bridge = new D1SyncBridge((env as any).REGISTAR_DB);
    const otpremnicaId = 'OTP-2026-LANAC';
    const fakturaId = 'FKT-2026-LANAC';

    // 1. Kreiramo Otpremnicu u izolovanoj tabeli
    await bridge.upsertDocument({
      id: otpremnicaId, tip: 'OTPREMNICA', broj: 'OTP-LANAC-001',
      pibProdavca: pibProdavca, pibKupca: pibKupca, status: 'SENT',
      xmlBlob: '<DespatchAdvice>...</DespatchAdvice>'
    });

    // 2. Kreiramo Fakturu koja drži parent_id vezu
    await bridge.upsertDocument({
      id: fakturaId, tip: '380', broj: 'FKT-LANAC-001',
      pibProdavca: pibProdavca, pibKupca: pibKupca, status: 'SENT',
      xmlBlob: '<Invoice>...</Invoice>', parentId: otpremnicaId
    });

    console.log("🔍 [Chain Audit] Pokrećem direktnu D1 SQL rekonstrukciju lanca dokumenata...");

    // 3. Direktni SQL upit u okviru iste niti (Potpuno izolovan od mrežnih zombi procesa)
    const dbResults = await (env as any).REGISTAR_DB.prepare(`
      SELECT id, tip, broj, parent_id 
      FROM dokumenti 
      WHERE id = ? OR parent_id = ?
      ORDER BY kreirano_u ASC
    `).bind(otpremnicaId, otpremnicaId).all();

    const chain = dbResults.results;
    
    expect(chain).toBeDefined();
    expect(chain.length).toBe(2);
    expect(chain.find((d: any) => d.id === fakturaId)).toBeDefined();
    expect(chain.find((d: any) => d.id === otpremnicaId)).toBeDefined();
    
    const docFaktura = chain.find((d: any) => d.id === fakturaId);
    expect(docFaktura.parent_id).toBe(otpremnicaId);

    console.log("🟢 [Chain Audit Success] Finansijski lanac (Otpremnica -> Faktura) uspešno verifikovan!");
  });
});
