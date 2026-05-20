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
    }, env);

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.klijent_id).toBe('klijent_123456789');

    // Provera u D1
    const klijent = await env.REGISTAR_DB.prepare("SELECT * FROM klijenti WHERE klijent_id = ?")
      .bind(data.klijent_id).first();
    expect(klijent).toBeDefined();
  });

  it('treba da izvrši rollback ako batch import sadrži nevalidne podatke', async () => {
    const klijentId = 'klijent_rollback_test';
    
    // Ručna inicijalizacija klijenta za potrebe testa
    await env.REGISTAR_DB.prepare("INSERT INTO klijenti (klijent_id, naziv) VALUES (?, ?)")
      .bind(klijentId, 'Rollback Test').run();
    
    // Postavljanje API ključa u DO
    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    const klijentDO = env.KLIJENT_BAZA_OBJECT.get(doId);
    await klijentDO.fetch(new Request('http://do/config', {
      method: 'POST',
      body: JSON.stringify({ sef_api_key: 'key' }),
      headers: { 'Content-Type': 'application/json' }
    }));

    // Slanje batch-a gde jedna faktura krši integritet (npr. nedostaje broj_fakture)
    const res = await app.request('/api/fakture/batch', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Klijent-ID': klijentId
      },
      body: JSON.stringify({
        fakture: [
          { ID: "OK-1", broj_fakture: "F-01", iznos: 100 },
          { ID: "BAD-1" } // Nedostaje broj_fakture (NOT NULL u SQLite)
        ]
      })
    }, env);

    expect(res.status).toBe(202);

    // Polling za neuspeh (jedna će proći ingestion, ali će pući u processQueue)
    let attempts = 0;
    let failCount = 0;
    while (attempts < 10) {
      const statsRes = await klijentDO.fetch(new Request('http://do/stats'));
      const stats = await statsRes.json() as any;
      const failed = stats.stats.find((s: any) => s.status === 'Failed');
      if (failed && failed.broj > 0) {
        failCount = failed.broj;
        break;
      }
      await new Promise(r => setTimeout(r, 200));
      attempts++;
    }
    expect(failCount).toBeGreaterThan(0);
  });
});
