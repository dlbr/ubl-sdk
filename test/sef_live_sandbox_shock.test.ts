// test/sef_live_sandbox_shock.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { SefUblBuilder } from '../packages/sef-ubl-builder/src/index';
import { handleSefErrorWithEdgeAi } from '../worker/edge-ai-interceptor';

describe('🚀 SEF Live Sandbox Integration — Live Hotfix Testing', () => {
  const LIVE_DEMO_API_KEY = process.env.STAGING_SEF_API_KEY;
  
  let mockEnv: any;
  let mockCtx: any;
  let upisanePorukeUQueue: any[];
  let kvStore: Map<string, string>;

  beforeEach(() => {
    upisanePorukeUQueue = [];
    kvStore = new Map<string, string>();

    // Simuliramo okruženje, ali AI sloj ostavljamo spreman da reaguje na žive stringove
    mockEnv = {
      PORESKI_KV: {
        put: async (key: string, value: string) => { kvStore.set(key, value); },
        get: async (key: string) => kvStore.get(key) || null,
      },
      SEF_QUEUE: {
        send: async (payload: any) => { upisanePorukeUQueue.push(payload); }
      },
      // Edge AI simulacija koja uživo analizira stvarni odgovor države
      AI: {
        run: async (model: string, options: any) => {
          const userPrompt = options.messages.find((m: any) => m.role === 'user').content;
          
          // Ako stvarni odgovor sa državnog demo servera sadrži grešku u strukturi
          if (userPrompt.includes('Schematron') || userPrompt.includes('invalid') || userPrompt.includes('Error') || userPrompt.includes('failed')) {
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

  it('1. ŽIVI PROBOJ: Slanje namerno nevalidnog XML-a na državni Demo SEF i provera Edge AI reakcije', async () => {
    // Ako nema ključa u okruženju, preskačemo test da ne rušimo lokalni build bez kredencijala
    if (!LIVE_DEMO_API_KEY) {
      console.warn("⚠️ Preskačem živi test jer STAGING_SEF_API_KEY nije definisan u okruženju.");
      return;
    }

    // 1. Generišemo XML preko našeg usklađenog SefUblBuilder-a
    // Namerno šaljemo "loše" podatke (npr. nepostojeći testni PIB) da bismo naterali državni demo server da nas odbije
    const malformisaniXml = SefUblBuilder.buildStandardna({
      broj: 'FKT-LIVE-SHOCK-TEST-001',
      pibProdavca: '000000000', // Nevalidan PIB koji će aktivirati državni validator
      pibKupca: '999999999',
      osnovica: 1000,
      pdv: 200
    });

    console.log("📡 Ispaljujem stvarni mrežni zahtev na državni DEMO SEF...");

    // 2. VRŠIMO STVARNI POZIV DRŽAVNOM SANDBOX-U (SUTrans API rute)
    const ziviOdgovorDrzave = await fetch('https://demosef.mfin.gov.rs/api/publicApi/sales-invoice/ubl', {
      method: 'POST',
      headers: {
        'ApiKey': LIVE_DEMO_API_KEY,
        'Content-Type': 'application/xml',
        'Accept': 'application/json'
      },
      body: malformisaniXml
    });

    // Država nas odbija sa HTTP 400 jer smo poslali nepostojeće poreske subjekte
    expect(ziviOdgovorDrzave.status).toBe(400);

    // 3. Propuštamo ovaj ŽIVI, sirovi odgovor države kroz naš Edge AI presretač
    const odgovorKlijentskomErpU = await handleSefErrorWithEdgeAi(
      ziviOdgovorDrzave,
      "internal_db_id_001",
      "FKT-LIVE-SHOCK-TEST-001",
      malformisaniXml,
      mockEnv,
      mockCtx
    );

    // =========================================================================
    // VERIFIKACIJA AUTONOMNE ODBRANE POD ŽIVIM ŠOKOM
    // =========================================================================

    // Klijentski ERP dobija stabilan 202 štit (Izbegli smo pucanje integracije!)
    expect(odgovorKlijentskomErpU.status).toBe(202);
    const jsonOdgovora = await odgovorKlijentskomErpU.json();
    expect(jsonOdgovora.status).toBe("QUEUED_FOR_COMPLIANCE");

    // Proveravamo da li je dokument bezbedno zaključan u Queue štitu
    expect(upisanePorukeUQueue).toHaveLength(1);
    expect(upisanePorukeUQueue[0].broj).toBe("FKT-LIVE-SHOCK-TEST-001");

    // Proveravamo da li je rampa uspešno podignuta u KV-u na osnovu žive poruke sa SEF-a
    const kvStatusRaw = kvStore.get("ALERT_SEF_HOTFIX_DETECTED");
    expect(kvStatusRaw).not.toBeNull();
    
    const kvStatus = JSON.parse(kvStatusRaw!);
    expect(kvStatus.status).toBe("POTREBNA_INSPEKCIJA");
    console.log("✅ Živa poruka greške koju je Llama uspešno obradila:", kvStatus.uzrok);
  });
});
