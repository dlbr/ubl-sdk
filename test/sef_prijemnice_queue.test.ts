import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { D1SyncBridge } from '../shared/services/D1SyncBridge';
import worker from '../worker/index';

describe('🚀 Asinhroni Štit — Izlazne Prijemnice Queue Consumer Audit', () => {
  const klijentId = '113398540'; // PIB sa tvog screenshot-a
  const pibDobavljaca = '987654321';

  beforeEach(async () => {
    vi.useRealTimers();

    // Inicijalizacija šeme
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
      );
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

    await (env as any).REGISTAR_DB.prepare("DELETE FROM dokumenti_log").run();
    await (env as any).REGISTAR_DB.prepare("DELETE FROM dokumenti").run();
  });

  it('Treba uspešno da preuzme prijemnicu iz Queue-a, pošalje je na SEF i ažurira status u D1', async () => {
    const bridge = new D1SyncBridge((env as any).REGISTAR_DB);
    
    // USKLAĐUJEMO ID I BROJ RADI SATISFAKCIJE STRANOG KLJUČA
    const originalnaOtpremnicaId = 'OTP-PARENT-001';
    const internaPrijemnicaId = 'REC-2026-001';

    // 1. Simuliramo originalnu dolaznu otpremnicu dobavljača u bazi (Koren lanca)
    await bridge.upsertDocument({
      id: originalnaOtpremnicaId,
      tip: 'OTPREMNICA',
      broj: originalnaOtpremnicaId, 
      pibProdavca: pibDobavljaca,
      pibKupca: klijentId,
      status: 'SENT'
    });

    // 2. Simuliramo našu izlaznu prijemnicu koja trenutno visi u statusu obrade
    await bridge.upsertDocument({
      id: internaPrijemnicaId,
      tip: 'PRIJEMNICA',
      broj: internaPrijemnicaId,
      pibProdavca: pibDobavljaca,
      pibKupca: klijentId,
      status: 'PENDING_PROCESSING',
      parentId: originalnaOtpremnicaId,
      xmlBlob: '<ReceiptAdvice>...</ReceiptAdvice>'
    });

    // 3. Presrećemo SefClient fetch pozive unutar Queue-a
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input.toString();
      
      // Faza 1: Upload XML-a prolazi glatko
      if (url.includes('/public/documents/requests')) {
         return new Response(null, { status: 200 });
      }

      // Faza 2: Polling dolaznog registra vraća stvarni državni SEF ID
      if (url.includes('/customers/changes') || url.includes('/changes')) {
        return new Response(JSON.stringify({ 
          items: [{ 
            data: { 
              receiptAdvice: { 
                id: 'MFIN-REC-112233', 
                documentNumber: internaPrijemnicaId
              } 
            } 
          }] 
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    });

    // 4. Formiramo lažni Batch paket iz OTPREMNICA_QUEUE
    const mockMessageBatch: any = {
      queue: "eotpremnice-reconciliation-queue",
      messages: [
        {
          id: "msg-123",
          body: {
            documentNumber: internaPrijemnicaId,
            pib: klijentId,
            tip: 'PRIJEMNICA',
            pokusaj: 1
          },
          ack: vi.fn(),
          retry: vi.fn()
        }
      ]
    };

    console.log("📥 [Queue Test] Isporučujem Prijemnicu iz OTPREMNICA_QUEUE u handleLogisticsQueue...");

    // 5. Pokrećemo direktno krovni queue handler
    await worker.queue(mockMessageBatch, env as any, {} as any);

    // 6. Verifikacija: Proveravamo da li je status prebačen u ACCEPTED i upisan sef_id
    const doc = await (env as any).REGISTAR_DB.prepare("SELECT status, sef_id FROM dokumenti WHERE id = ?").bind(internaPrijemnicaId).first() as any;
    
    expect(doc).toBeDefined();
    expect(doc.status).toBe('ACCEPTED');
    expect(doc.sef_id).toBe('MFIN-REC-112233');

    // Potvrđujemo da je poruka uspešno skinuta sa Queue reda
    expect(mockMessageBatch.messages[0].ack).toHaveBeenCalled();

    console.log("🟢 [Queue Audit Success] Izlazna prijemnica uspešno ispaljena na SEF i vidljiva u bazi!");
    fetchSpy.mockRestore();
  });
});
