import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { app } from './index'; // Imenovani uvoz
describe('SEF Bridge - Integration Tests', () => {
  
  beforeAll(async () => {
    // Inicijalizacija šeme na testnoj bazi
    await env.REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS klijenti (
        klijent_id TEXT PRIMARY KEY,
        naziv TEXT NOT NULL,
        ima_aktivne_fakture INTEGER DEFAULT 0,
        poslednji_sync DATETIME DEFAULT '1970-01-01 00:00:00',
        kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    
    await env.REGISTAR_DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_aktivne_fakture_sync ON klijenti(ima_aktivne_fakture, poslednji_sync)
    `).run();
  });
  
  beforeEach(async () => {
    // Čišćenje centralne baze pre svakog testa
    await env.REGISTAR_DB.prepare("DELETE FROM klijenti").run();
  });

  it('treba uspešno da registruje klijenta i inicijalizuje bazu', async () => {
    const res = await app.request('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pib: '123456789',
        naziv: 'Test Firma DOO',
        sef_api_key: 'test_key_123'
      })
    }, env as any);

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.klijent_id).toBe('klijent_123456789');

    // Provera u D1
    const klijent = await env.REGISTAR_DB.prepare("SELECT * FROM klijenti WHERE klijent_id = ?")
      .bind(data.klijent_id).first();
    expect(klijent).toBeDefined();
  });
});
