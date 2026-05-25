import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { D1SyncBridge } from '../shared/services/D1SyncBridge';
import { app } from '../worker/index';
import worker from '../worker/index';

describe('🛡️ Finansijski Štit — Knjižno Odobrenje Automatizacija Audit', () => {
  const klijentId = 'klijent_113398540'; 
  const pibProdavca = '113398540';
  const pibKupca = '105674049';

  beforeAll(async () => {
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
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dokument_id TEXT NOT NULL,
        prethodni_status TEXT,
        novi_status TEXT NOT NULL,
        poruka TEXT,
        kreirano_u DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(dokument_id) REFERENCES dokumenti(id)
      );
    `).run();
  });

  it('Treba uspešno da preuzme prijemnicu iz Queue-a, pošalje je na SEF i ažurira status u D1', async () => {
    const bridge = new D1SyncBridge((env as any).REGISTAR_DB);
    const originalnaOtpremnicaId = 'OTP-PARENT-001';
    const internaPrijemnicaId = 'REC-2026-001';

    await bridge.upsertDocument({
      id: originalnaOtpremnicaId,
      tip: 'OTPREMNICA',
      broj: 'OTP-PARENT-001', 
      pibProdavca: pibProdavca,
      pibKupca: klijentId,
      status: 'SENT'
    });

    await bridge.upsertDocument({
      id: internaPrijemnicaId,
      tip: 'PRIJEMNICA',
      broj: internaPrijemnicaId,
      pibProdavca: pibProdavca,
      pibKupca: klijentId,
      status: 'PENDING_PROCESSING',
      parentId: originalnaOtpremnicaId,
      xmlBlob: '<ReceiptAdvice>...</ReceiptAdvice>'
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input.toString();
      if (url.includes('/public/documents/requests')) return new Response(null, { status: 200 });
      if (url.includes('/customers/changes') || url.includes('/changes')) {
        return new Response(JSON.stringify({ 
          items: [{ data: { receiptAdvice: { id: 'MFIN-REC-112233', documentNumber: internaPrijemnicaId } } }] 
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    });

    const mockMessageBatch: any = {
      queue: "eotpremnice-reconciliation-queue",
      messages: [
        {
          id: "msg-123",
          body: { documentNumber: internaPrijemnicaId, pib: klijentId, tip: 'PRIJEMNICA', pokusaj: 1 },
          ack: vi.fn(),
          retry: vi.fn()
        }
      ]
    };

    await (worker as any).queue(mockMessageBatch, env, {} as any);

    const doc = await (env as any).REGISTAR_DB.prepare("SELECT status, sef_id FROM dokumenti WHERE id = ?").bind(internaPrijemnicaId).first() as any;
    expect(doc.status).toBe('ACCEPTED');
    expect(doc.sef_id).toBe('MFIN-REC-112233');
    expect(mockMessageBatch.messages[0].ack).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('Treba automatski generisati Knjižno odobrenje (381) na osnovu SQL analitike manjka robe', async () => {
    const bridge = new D1SyncBridge((env as any).REGISTAR_DB);
    const otpremnicaId = 'OTP-SPOR-001';
    const fakturaId = 'FKT-ORIGINAL-380';

    await bridge.upsertDocument({
      id: fakturaId, sefId: 'MFIN-UUID-FAKTURA-112233', tip: '380', broj: 'FKT-001',
      pibProdavca, pibKupca, status: 'APPROVED', kreirano_u: '2026-05-25 12:00:00', parentId: otpremnicaId
    });

    vi.spyOn(D1SyncBridge.prototype, 'analyzeReconciliation').mockImplementation(async () => {
      return {
        results: [{
          stavka_otpremnice_id: '1', artikal_naziv: 'Cement',
          kvantitativni_manjak: 15, devijacija_gustine: 0,
          jedinica_mere: 'TNE', cena: 120
        }]
      } as any;
    });

    const res = await app.request(`/api/otpremnice/reconcile-credit-note/${otpremnicaId}`, {
      method: 'POST',
      headers: { 'X-Klijent-ID': klijentId }
    }, env);

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);

    const proveraBaze = await (env as any).REGISTAR_DB.prepare("SELECT * FROM dokumenti WHERE tip = '381'").first() as any;
    expect(proveraBaze).toBeDefined();
    expect(proveraBaze.parent_id).toBe(fakturaId);
  });
});
