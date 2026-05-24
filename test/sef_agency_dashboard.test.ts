import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { app } from '../worker/index';

describe('Agency Dashboard & Multi-Tenant Security Suite', () => {

  const ADMIN_KEY = 'admin_secret';
  let MASTER_TOKEN = '';
  let AGENCY_ID = '';

  const suffix = Date.now();
  const kIdAlfa = `klijent_alfa_${suffix}`;
  const kIdBeta = `klijent_beta_${suffix}`;
  const testPibAlfa = `111${suffix}`.substring(0, 9);
  const testPibBeta = `222${suffix}`.substring(0, 9);

  beforeAll(async () => {
    // Inicijalizacija centralne baze
    await env.REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS klijenti (
        klijent_id TEXT PRIMARY KEY, naziv TEXT NOT NULL,
        ima_aktivne_fakture INTEGER DEFAULT 0, poslednji_sync DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    await env.REGISTAR_DB.prepare(`CREATE TABLE IF NOT EXISTS agencije (id TEXT PRIMARY KEY, naziv TEXT, email TEXT, master_token TEXT UNIQUE, kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP)`).run();
    await env.REGISTAR_DB.prepare(`CREATE TABLE IF NOT EXISTS agencija_klijenti (agencija_id TEXT, pib_firme TEXT PRIMARY KEY, tenant_klijent_id TEXT, kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP)`).run();

    // 1. Registruj agenciju
    const regRes = await app.request('/api/agency/register', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ADMIN_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ naziv: 'Super Agencija', email: 'info@agencija.rs' })
    }, env);
    const regData = await regRes.json() as any;
    MASTER_TOKEN = regData.masterToken;
    AGENCY_ID = regData.agencyId;

    // 2. Registruj i konfiguriši dva klijenta (Alfa i Beta)
    for (const [id, pib] of [[kIdAlfa, testPibAlfa], [kIdBeta, testPibBeta]]) {
      await env.REGISTAR_DB.prepare("INSERT INTO klijenti (klijent_id, naziv) VALUES (?, ?)")
        .bind(id, `Firma ${id}`).run();
      
      const doId = env.KLIJENT_BAZA_OBJECT.idFromName(id);
      const kDO = env.KLIJENT_BAZA_OBJECT.get(doId);
      await kDO.fetch(new Request('http://do/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sef_api_key: `key_${id}`, limit: 100 })
      }));
    }

    // 3. Poveži klijente sa agencijom
    await app.request('/api/agency/link-client', {
      method: 'POST',
      headers: { 'X-Agency-Token': MASTER_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pib_firme: testPibAlfa, tenant_id: kIdAlfa })
    }, env);

    await app.request('/api/agency/link-client', {
      method: 'POST',
      headers: { 'X-Agency-Token': MASTER_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pib_firme: testPibBeta, tenant_id: kIdBeta })
    }, env);
  });

  it('Test 44/45: Master ključ agencije uspešno agregira podatke sa dashboard-a', async () => {
    const res = await app.request('/api/agency/dashboard', {
      method: 'GET',
      headers: { 'X-Agency-Token': MASTER_TOKEN }
    }, env);

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.klijenti.length).toBe(2);
    
    const alfa = data.klijenti.find((k: any) => k.pib === testPibAlfa);
    expect(alfa.krediti).toBe(100);
    expect(alfa.status).toBe('AKTIVAN');
  });

  it('Test 45/45: Sistem striktno blokira pristup sa nevalidnim tokenom', async () => {
    const res = await app.request('/api/agency/dashboard', {
      method: 'GET',
      headers: { 'X-Agency-Token': 'HACKER_TOKEN' }
    }, env);

    expect(res.status).toBe(401);
    const data = await res.json() as any;
    expect(data.error).toBe('Nevalidan Agency Token');
  });
});
