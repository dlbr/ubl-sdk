// test/sef_live_sandbox_shock.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SefUblBuilder } from '@dlbr/ubl-sdk';
import { handleSefErrorWithEdgeAi } from '../packages/backend/src/edge-ai-interceptor';

describe('🚀 SEF Live Sandbox Integration — Live Hotfix Testing', () => {
  const LIVE_DEMO_API_KEY = process.env.STAGING_SEF_API_KEY;
  
  let mockEnv: any;
  let mockCtx: any;
  let upisanePorukeUQueue: any[];
  let kvStore: Map<string, string>;

  beforeEach(() => {
    upisanePorukeUQueue = [];
    kvStore = new Map<string, string>();

    mockEnv = {
      PORESKI_KV: {
        put: async (key: string, value: string) => { kvStore.set(key, value); },
        get: async (key: string) => kvStore.get(key) || null,
        delete: async (key: string) => { kvStore.delete(key); },
      },
      SEF_QUEUE: {
        send: async (payload: any) => { upisanePorukeUQueue.push(payload); }
      },
      AI: {
        run: async (model: string, options: any) => {
          const userPrompt = options.messages.find((m: any) => m.role === 'user').content;
          // Simulacija Llama 3 inteligencije: Detektujemo Schematron grešku
          if (userPrompt.includes('Schematron') || userPrompt.includes('invalid') || userPrompt.includes('Error')) {
            return {
              response: JSON.stringify({ tip: "BREAKING_HOTFIX", akcija: "QUEUE" })
            };
          }
          return { response: JSON.stringify({ tip: "STANDARD_REJECT", akcija: "REJECT" }) };
        }
      },
      TELEGRAM_BOT_TOKEN: "MOCK_TOKEN",
      TELEGRAM_CHAT_ID: "MOCK_CHAT"
    };

    mockCtx = { waitUntil: (promise: Promise<any>) => promise };
  });

  it('1. SIMULACIJA ŠOKA: Obrada Schematron greške preko Edge AI presretača u pozadini', async () => {
    // v4.3.8: Zbog anomalije na Demo SEF-u (koji nekada vraća 200 za nevalidne podatke),
    // ovde eksplicitno mokujemo 400 rejection da bismo testirali AI logiku presretanja.
    
    const malformisaniXml = SefUblBuilder.buildStandardna({
      broj: 'FKT-SHOCK-001',
      pibProdavca: '101134702',
      pibKupca: '113398540',
      osnovica: 1000,
      pdv: 200
    });

    // Simuliramo odgovor države koji nosi Schematron grešku (Breaking Change)
    const mockSefResponse = new Response(
      JSON.stringify({ 
        Success: false, 
        Message: "Schematron validation failed: [B-SEC-01] CustomizationID is invalid." 
      }), 
      { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );

    console.log("📡 Simuliram KRITIČNU GREŠKU sa SEF-a (400 Bad Request)...");

    // 2. Propuštamo ovaj (simulirani) sirovi odgovor države kroz naš Edge AI presretač
    await handleSefErrorWithEdgeAi(
      mockSefResponse,
      "db_id_shock",
      "FKT-SHOCK-001",
      malformisaniXml,
      mockEnv,
      mockCtx
    );

    // =========================================================================
    // VERIFIKACIJA AUTONOMNE ODBRANE
    // =========================================================================

    // Proveravamo da li je dokument bezbedno zaključan u Queue štitu
    expect(upisanePorukeUQueue).toHaveLength(1);
    expect(upisanePorukeUQueue[0].broj).toBe("FKT-SHOCK-001");

    // Proveravamo da li je rampa uspešno podignuta u KV-u
    const kvStatusRaw = kvStore.get("ALERT_SEF_HOTFIX_DETECTED");
    expect(kvStatusRaw).not.toBeNull();
    
    const kvStatus = JSON.parse(kvStatusRaw!);
    expect(kvStatus.status).toBe("POTREBNA_INSPEKCIJA");
    console.log("✅ Edge AI je uspešno klasifikovao grešku i aktivirao Queue štit.");
  });
});
