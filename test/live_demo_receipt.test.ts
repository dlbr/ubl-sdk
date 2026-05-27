import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { ReceiptBuilder } from '../packages/ubl-sdk/src/builder/ReceiptBuilder';
import { SefClient } from '@sef/shared/services/sefClient';
import { D1SyncBridge } from '@sef/shared/services/D1SyncBridge';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const runLive = process.env.RUN_LIVE_HANDSHAKE === 'true';

describe.runIf(runLive)('🚀 MFIN ePrijemnica Demo - Live Smoke Test', () => {
  // NAPOMENA: Koristimo OTPREMNICE_API_KEY iz .dev.vars
  const API_KEY = '7e74bbc3-109e-476f-afcd-5430a41a7a1e'; 
  const BASE_URL = 'https://api.demoeotpremnica.mfin.gov.rs';

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
  });

  it('Treba uspešno poslati ePrijemnicu na MFIN i povući njen dodeljeni ID', async () => {
    const jedinstveniBroj = `REC-LIVE-${Date.now().toString().slice(-6)}`;
    
    // Koristimo ID otpremnice koju smo upravo poslali u prethodnom live testu
    // Ako nemaš pri ruci, koristi bilo koji DocumentNumber koji postoji na tvom demo portalu
    const originalDespatchNumber = 'OTP-HANDSHAKE-115159';

    const testReceipt = {
      id: jedinstveniBroj,
      issueDate: new Date().toISOString().split('T')[0],
      supplier: { 
        pib: '113398540', name: 'MALABO DOO BEOGRAD-SURČIN',
        maticniBroj: '21589144'
      },
      buyer: { 
        pib: '105674049', name: 'AUTO CENTAR MEDIĆ DOO SURČIN',
        maticniBroj: '20385758'
      },
      despatchReference: { id: originalDespatchNumber },
      lines: [
        { 
          id: '1', 
          itemName: 'Verifikacioni paket - Audit Proof v4.42.0', 
          receivedQuantity: 50, 
          unitCode: 'H87',
          despatchLineReference: { id: '1' }
        }
      ]
    };

    const builder = ReceiptBuilder.create(testReceipt.id, testReceipt.issueDate)
      .setSeller(testReceipt.supplier as any)
      .setBuyer(testReceipt.buyer as any)
      .setDespatchReference(testReceipt.despatchReference.id)
      .addLine(testReceipt.lines[0]);
    
    const xml = builder.toXml();

    const client = new SefClient({
      apiKey: API_KEY,
      baseUrl: BASE_URL,
      environment: 'sandbox'
    });

    console.log(`📡 Šaljem ePrijemnicu ${jedinstveniBroj} (odgovor na ${originalDespatchNumber})...`);
    
    // Live Handshake (Phase 1 & 2 internally)
    const requestId = crypto.randomUUID();
    const result = await client.sendReceiptAdvice(xml, requestId, jedinstveniBroj);

    if (!result.success) {
      console.error("❌ MFIN je odbio ePrijemnicu! Razlog:", result.error);
      throw new Error(`Državni server vratio grešku: ${result.error}`);
    }

    console.log(`🟢 MFIN PRIHVATIO! Dodeljen MFIN ID: ${result.mfinId}`);
    expect(result.success).toBe(true);
    expect(result.mfinId).toBeDefined();

    // Sinhronizacija u D1
    const bridge = new D1SyncBridge((env as any).REGISTAR_DB);
    await bridge.upsertDocument({
      id: `INT-${jedinstveniBroj}`,
      sefId: result.mfinId,
      tip: 'PRIJEMNICA',
      broj: jedinstveniBroj,
      pibProdavca: testReceipt.supplier.pib,
      pibKupca: testReceipt.buyer.pib,
      status: 'ACCEPTED',
      xmlBlob: xml,
      parentId: originalDespatchNumber
    });

    console.log(`🏁 ePrijemnica uspešno proknjižena na DEMO i D1! MFIN ID: ${result.mfinId}`);
  });
});
