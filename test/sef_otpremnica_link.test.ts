import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { D1SyncBridge } from '../shared/services/D1SyncBridge';
import { app } from '../worker/index';

describe('⛓️ SEF & eOtpremnica — Lančana Verifikacija', () => {
  
  beforeAll(async () => {
    // Inicijalizacija centralne baze (D1)
    await env.REGISTAR_DB.prepare(`
      CREATE TABLE IF NOT EXISTS dokumenti (
        id TEXT PRIMARY KEY,
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
      );
    `).run();
  });

  it('treba ispravno povezati Otpremnicu i Fakturu u D1 bazi', async () => {
    const bridge = new D1SyncBridge(env.REGISTAR_DB);

    // 1. Kreiramo Otpremnicu
    const otpremnicaId = 'OTP-2026-001';
    await bridge.upsertDocument({
      id: otpremnicaId,
      tip: 'OTPREMNICA',
      broj: 'OTP-001',
      pibProdavca: '113398540',
      pibKupca: '105674049',
      status: 'SENT',
      xmlBlob: '<DespatchAdvice>...</DespatchAdvice>'
    });

    // 2. Kreiramo Fakturu koja se poziva na Otpremnicu
    const fakturaId = 'FKT-2026-001';
    await bridge.upsertDocument({
      id: fakturaId,
      tip: '380',
      broj: 'FKT-001',
      pibProdavca: '113398540',
      pibKupca: '105674049',
      status: 'SENT',
      xmlBlob: '<Invoice>...</Invoice>',
      parentId: otpremnicaId // <--- KLJUČNA VEZA
    });

    // 3. Verifikujemo lanac preko API-ja
    const res = await app.request(`/api/dokumenti/chain/${otpremnicaId}`, {
      method: 'GET',
      headers: { 'X-Klijent-ID': 'klijent_113398540' } // Mock auth if needed
    }, env);
    
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    const chain = data.chain;
    
    expect(chain.length).toBe(2);
    expect(chain.find((d: any) => d.id === fakturaId)).toBeDefined();
    expect(chain.find((d: any) => d.id === otpremnicaId)).toBeDefined();
    
    // Provera parent_id veze u bazi
    const docFaktura = chain.find((d: any) => d.id === fakturaId);
    expect(docFaktura.parent_id).toBe(otpremnicaId);
  });
});
