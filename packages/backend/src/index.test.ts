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
});
