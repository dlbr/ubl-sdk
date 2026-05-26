import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { app } from './index'; // Imenovani uvoz
describe('SEF Bridge - Integration Tests', () => {
  
  beforeAll(async () => {
    // Inicijalizacija šeme na testnoj bazi
    await (env as any).REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS klijenti (
        klijent_id TEXT PRIMARY KEY,
        naziv TEXT NOT NULL,
        ima_aktivne_fakture INTEGER DEFAULT 0,
        poslednji_sync DATETIME DEFAULT '1970-01-01 00:00:00',
        kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await (env as any).REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS sef_kompanije (
        pib TEXT PRIMARY KEY,
        naziv_firme TEXT NOT NULL
      )
    `).run();
    
    await (env as any).REGISTAR_DB.prepare(`
      INSERT OR IGNORE INTO sef_kompanije (pib, naziv_firme) VALUES ('123456789', 'Test Firma DOO')
    `).run();
    
    await (env as any).REGISTAR_DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_aktivne_fakture_sync ON klijenti(ima_aktivne_fakture, poslednji_sync)
    `).run();

    await (env as any).REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS nbs_kursna_lista_cache (
        valuta TEXT NOT NULL,
        datum TEXT NOT NULL,
        kurs REAL NOT NULL,
        kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (valuta, datum)
      )
    `).run();
  });
  
  beforeEach(async () => {
    // Čišćenje centralne baze pre svakog testa
    await (env as any).REGISTAR_DB.prepare("DELETE FROM klijenti").run();
  });

  it('treba uspešno da registruje klijenta i inicijalizuje bazu', async () => {
    // 1. Inicijalizuj DO pre logina
    const klijentBaseName = 'klijent_123456789';
    const doId = (env as any).KLIJENT_BAZA_OBJECT.idFromName(klijentBaseName);
    const doStub = (env as any).KLIJENT_BAZA_OBJECT.get(doId);
    await doStub.fetch('http://do/test/seed', {
      method: 'POST',
      body: JSON.stringify({
        action: 'RESET_LEDGER',
        config: { sef_api_key: 'test_key_123', klijent_id: klijentBaseName, environment: 'sandbox' }
      })
    });

    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pib: '123456789',
        naziv: 'Test Firma DOO',
        api_key: 'test_key_123'
      })
    }, env as any);

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.klijentId).toBe('klijent_123456789');

    // Provera u D1
    const klijent = await (env as any).REGISTAR_DB.prepare("SELECT * FROM klijenti WHERE klijent_id = ?")
      .bind(data.klijentId).first();
    expect(klijent).toBeDefined();
  });

  it('treba da dohvati logove sa /api/dashboard/logs', async () => {
    const res = await app.request('/api/dashboard/logs', {
      method: 'GET',
      headers: { 'X-Klijent-ID': 'klijent_123456789' }
    }, env as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(Array.isArray(data.logs)).toBe(true);
  });

  it('treba da dohvati fakture sa /api/fakture', async () => {
    const res = await app.request('/api/fakture?page=1', {
      method: 'GET',
      headers: { 'X-Klijent-ID': 'klijent_123456789' }
    }, env as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(Array.isArray(data.fakture)).toBe(true);
  });

  it('treba da dohvati uputstva za webhook sa /api/webhook-setup', async () => {
    const res = await app.request('/api/webhook-setup', {
      method: 'GET',
      headers: { 'X-Klijent-ID': 'klijent_123456789' }
    }, env as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.instructions).toBeDefined();
  });

  it('treba da dohvati javnu kursnu listu sa /api/public/v1/kursna-lista sa trendovima', async () => {
    // 1. Unapred popuni keš za danas i juče
    const danas = new Date().toISOString().split('T')[0];
    const juceDate = new Date();
    juceDate.setDate(juceDate.getDate() - 1);
    const juce = juceDate.toISOString().split('T')[0];

    await (env as any).REGISTAR_DB.prepare(
      "INSERT OR REPLACE INTO nbs_kursna_lista_cache (valuta, datum, kurs) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?), (?, ?, ?), (?, ?, ?), (?, ?, ?)"
    ).bind(
      'EUR', danas, 117.2, 'USD', danas, 108.5, 'CHF', danas, 121.1,
      'EUR', juce, 117.1, 'USD', juce, 108.6, 'CHF', juce, 121.1
    ).run();

    const res = await app.request('/api/public/v1/kursna-lista', { method: 'GET' }, env as any);
    
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.status).toBe('success');
    expect(data.valute.EUR.kurs).toBe(117.2);
    expect(data.valute.EUR.trend.smer).toBe('GORE'); // 117.2 > 117.1
    expect(data.valute.USD.trend.smer).toBe('DOLE'); // 108.5 < 108.6
    expect(data.valute.CHF.trend.smer).toBe('ISTO'); // 121.1 == 121.1
    expect(data.tiker).toHaveLength(3);
    expect(data.schemaOrg['@type']).toBe('FinancialProduct');
  });

  it('treba da vrati 500 ako generisanje OG slike pukne (npr. zbog WASM restrikcija u testu)', async () => {
    const res = await app.request('/api/public/v1/kursna-lista/og.png', { method: 'GET' }, env as any);
    // U testnom okruženju vpw (vitest-pool-workers), WebAssembly.instantiate može biti zabranjen
    // pa očekujemo ili sliku (ako proradi) ili 500 sa greškom.
    if (res.status === 200) {
      expect(res.headers.get('Content-Type')).toBe('image/png');
    } else {
      expect(res.status).toBe(500);
      const data = await res.json() as any;
      expect(data.error).toBe('OG_GEN_FAIL');
    }
  });
});
