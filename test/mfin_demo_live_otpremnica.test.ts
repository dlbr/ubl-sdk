import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { DespatchBuilder } from '../packages/ubl-sdk/src/builder/DespatchBuilder';
import { D1SyncBridge } from '../shared/services/D1SyncBridge';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const runLive = process.env.RUN_LIVE_HANDSHAKE === 'true';

describe.runIf(runLive)('🛡️ MFIN eOtpremnica — Neprobojni Two-Phase Handshake', () => {
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

  it('Treba uspešno izvršiti Fazu 1 i Fazu 2 i izvući stvarni MFIN ID', async () => {
    const jedinstveniBroj = `OTP-HANDSHAKE-${Date.now().toString().slice(-6)}`;

    const otpremnicaPayload = {
      id: jedinstveniBroj,
      issueDate: new Date().toISOString().split('T')[0],
      despatchDate: new Date().toISOString().split('T')[0],
      supplier: { 
        pib: '113398540', name: 'MALABO DOO BEOGRAD-SURČIN', 
        address: 'Ulica 1', city: 'Beograd', maticniBroj: '21589144' 
      },
      buyer: { 
        pib: '105674049', name: 'AUTO CENTAR MEDIĆ DOO SURČIN', 
        address: 'Sremska 2', city: 'Surčin', maticniBroj: '20385758' 
      },
      shipmentMethod: '1' as const,
      lines: [
        { id: '1', name: 'Verified Handshake v4.5.0', deliveredQuantity: 10, unitCode: 'H87' }
      ]
    };

    const builder = DespatchBuilder.create(otpremnicaPayload.id, otpremnicaPayload.issueDate)
      .setSeller(otpremnicaPayload.supplier)
      .setBuyer(otpremnicaPayload.buyer)
      .setShipmentMethod(otpremnicaPayload.shipmentMethod)
      .addLine(otpremnicaPayload.lines[0]);

    const xml = builder.toXml();

    // ==========================================
    // FAZA 1: ASINHRONO SLANJE DATOTEKE (Multipart)
    // ==========================================
    console.log(`📡 [FAZA 1] Ispaljujem XML na /public/documents/requests...`);
    
    const formData = new FormData();
    const requestId = crypto.randomUUID();
    formData.append('RequestId', requestId);
    const blob = new Blob([xml], { type: 'application/xml' });
    formData.append('File', blob, 'despatch.xml');

    const uploadResponse = await fetch(`${BASE_URL}/public/documents/requests`, {
      method: 'POST',
      headers: {
        'ApiKey': API_KEY,
        'Accept': 'application/json'
      },
      body: formData
    });

    console.log(`[FAZA 1 STATUS]: ${uploadResponse.status}`);
    expect(uploadResponse.status).toBe(200); 

    // Upisujemo dokument u D1 sa statusom čekanja
    const bridge = new D1SyncBridge((env as any).REGISTAR_DB);
    const internalId = `INT-${jedinstveniBroj}`;
    await bridge.upsertDocument({
      id: internalId,
      tip: 'OTPREMNICA',
      broj: jedinstveniBroj,
      pibProdavca: otpremnicaPayload.supplier.pib,
      pibKupca: otpremnicaPayload.buyer.pib,
      status: 'PENDING_PROCESSING',
      xmlBlob: xml,
      parentId: null
    });

    console.log("⏳ Čekam 6 sekundi da MFIN procesira XML...");
    await delay(6000);

    // ==========================================
    // FAZA 2: FORENZIČKA SONDA — LOV NA ENPOINT STATUS
    // ==========================================
    console.log(`🔍 [FAZA 2] Pretraga po RequestId: ${requestId} i DocumentNumber: ${jedinstveniBroj}`);

    const today = new Date().toISOString().split('T')[0];

    // Sonda A: Suppliers Changes
    const proveraA = await fetch(`${BASE_URL}/public/documents/suppliers/changes?date=${today}`, {
      method: 'GET',
      headers: { 'ApiKey': API_KEY, 'Accept': 'application/json' }
    });
    const dataA = await proveraA.json() as any;
    const itemsA = dataA.items || [];
    
    // Sonda B: Requests Changes
    const proveraB = await fetch(`${BASE_URL}/public/documents/requests/changes?date=${today}`, {
      method: 'GET',
      headers: { 'ApiKey': API_KEY, 'Accept': 'application/json' }
    });
    const dataB = await proveraB.json() as any;
    const itemsB = dataB.items || [];

    let mfinId: string | undefined;

    // Tražimo u Sondi A (Suppliers Changes)
    const foundA = itemsA.find((it: any) => it.data?.despatchAdvice?.documentNumber === jedinstveniBroj);
    if (foundA) {
       mfinId = foundA.data.despatchAdvice.id;
       console.log(`🎯 PRONAĐENO U SONDI A (Suppliers Changes)! MFIN ID: ${mfinId}`);
    }

    // Tražimo u Sondi B (Requests Changes) po RequestId
    if (!mfinId) {
      const foundB = itemsB.find((it: any) => it.requestId === requestId && it.type === 'DocumentRequest.Succeeded');
      if (foundB) {
         mfinId = foundB.data.documentId;
         console.log(`🎯 PRONAĐENO U SONDI B (Requests Changes)! MFIN ID: ${mfinId}`);
      }
    }

    // Osiguravamo uspeh testa
    expect(mfinId).toBeDefined();

    // Radimo konačnu stabilizaciju u D1 bazi
    await bridge.upsertDocument({
      id: internalId,
      sefId: mfinId, 
      tip: 'OTPREMNICA',
      broj: jedinstveniBroj,
      pibProdavca: otpremnicaPayload.supplier.pib,
      pibKupca: otpremnicaPayload.buyer.pib,
      status: 'SENT',
      xmlBlob: xml,
      parentId: null
    });

    console.log(`🏁 Transakcioni krug uspešno zatvoren. MFIN ID: ${mfinId} upisan u D1.`);
  });
});
