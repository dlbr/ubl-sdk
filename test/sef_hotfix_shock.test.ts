// test/sef_hotfix_shock.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSefErrorWithEdgeAi } from '../packages/backend/src/edge-ai-interceptor';

// Fail-safe za globalni crypto objekat u Node/Vitest testnom okruženju
if (!global.crypto) {
  // @ts-ignore
  global.crypto = { randomUUID: () => 'test-uuid-1234-5678' };
}

describe('🛡️ SEF Bridge v4.2.1 — Live Hotfix Shock & Circuit Breaker Simulation (Vitest)', () => {
  let mockEnv: any;
  let mockCtx: any;
  let upisanePorukeUQueue: any[];
  let poslateTelegramPoruke: any[];
  let kvStore: Map<string, string>;

  beforeEach(() => {
    upisanePorukeUQueue = [];
    poslateTelegramPoruke = [];
    kvStore = new Map<string, string>();

    // 1. Mock-ujemo Cloudflare KV (PORESKI_KV) sa čistim mapiranjem stanja
    mockEnv = {
      PORESKI_KV: {
        put: async (key: string, value: string) => { kvStore.set(key, value); },
        get: async (key: string) => kvStore.get(key) || null,
        delete: async (key: string) => { kvStore.delete(key); },
      },

      // 2. Mock-ujemo Cloudflare Queue (SEF_QUEUE) asinhroni štit
      SEF_QUEUE: {
        send: async (payload: any) => {
          upisanePorukeUQueue.push(payload);
        }
      },

      // 3. Mock-ujemo Workers AI (Llama 3 8B Instruct) sa determinističkim izlazom
      AI: {
        run: vi.fn().mockImplementation((model: string, options: any) => {
          const userPrompt = options.messages.find((m: any) => m.role === 'user').content;
          
          // Ako Llama uoči tragove Schematron-a ili prisilne validacije od strane države
          if (userPrompt.includes('Schematron') || userPrompt.includes('mandatory') || userPrompt.includes('Note')) {
            return {
              response: JSON.stringify({
                tip: "BREAKING_HOTFIX",
                akcija: "QUEUE"
              })
            };
          }
          
          return {
            response: JSON.stringify({
              tip: "STANDARD_REJECTION",
              akcija: "REJECT"
            })
          };
        })
      },

      // Eksterne konfiguracione varijable za Staging Telegram ChatOps
      TELEGRAM_BOT_TOKEN: "MOCK_TOKEN_123",
      TELEGRAM_CHAT_ID: "MOCK_CHAT_123"
    };

    // Mock-ujemo ctx.waitUntil kako bi mrežni poziv bota ostao asinhron i neblokirajući
    mockCtx = {
      waitUntil: (promise: Promise<any>) => {
        // U testnom okruženju odmah razrešavamo obećanje radi verifikacije nuspojava
        return promise;
      }
    };

    // Globalni fetch presretač za Telegram API pozive
    global.fetch = vi.fn().mockImplementation((url: any, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : (url?.url || '');
      
      if (urlStr.includes('api.telegram.org')) {
        poslateTelegramPoruke.push(JSON.parse(init?.body as string));
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
  });

  // =========================================================================
  // 🔬 TEST SCENARIO 1: DRŽAVNI HOTFIX (CRNI LABUD)
  // =========================================================================
  it('SIMULACIJA: Država pušta iznenadni Hotfix 3.17.1 -> Sistem aktivira asinhroni štit bez blokiranja ERP odgovora', async () => {
    const lokalniId = "faktura_internal_999";
    const brojDokumenta = "FKT-STAGE-HOTFIX-ANOMALIJA";
    const xmlSadrzaj = "<?xml version=\"1.0\"?><Invoice>...</Invoice>";

    // Država vraća HTTP 400 Bad Request sa neočekivanom Schematron validacijom
    const simuliraniSefOdgovor = new Response(
      "[XSD Error] Element Note is mandatory for Category S", 
      { status: 400 }
    );

    // Pokrećemo naš Edge AI interceptor (asinhroni savetnik)
    await handleSefErrorWithEdgeAi(
      simuliraniSefOdgovor,
      lokalniId,
      brojDokumenta,
      xmlSadrzaj,
      mockEnv,
      mockCtx
    );

    // ─── VERIFIKACIJA ISPUNJENOSTI OBAVEZA (ASSERTIONS) ───

    // 1. Dokaz da je dokument bezbedno zaključen u asinhronom Queue štitu (Krediti na Ledgeru su osigurani)
    expect(upisanePorukeUQueue).toHaveLength(1);
    expect(upisanePorukeUQueue[0].broj).toBe(brojDokumenta);
    expect(upisanePorukeUQueue[0].id).toBe(lokalniId);

    // 2. Dokaz da je Llama 3 spustila rampu unutar Cloudflare KV-a za taj tip dokumenta
    const kvStatusRaw = kvStore.get("ALERT_SEF_HOTFIX_DETECTED");
    expect(kvStatusRaw).not.toBeUndefined();
    const kvStatus = JSON.parse(kvStatusRaw!);
    expect(kvStatus.status).toBe("POTREBNA_INSPEKCIJA");
    expect(kvStatus.uzrok).toContain("Element Note is mandatory");

    // 3. Dokaz da je Telegram Bot uspešno i asinhrono ispalio interaktivni alarm u džep inženjera
    expect(poslateTelegramPoruke).toHaveLength(1);
    expect(poslateTelegramPoruke[0].chat_id).toBe("MOCK_CHAT_123");
    expect(poslateTelegramPoruke[0].text).toContain("Detektovan potencijalni državni Hotfix!");
    expect(poslateTelegramPoruke[0].text).toContain(brojDokumenta);
    
    // Verifikujemo prisustvo Inline Keyboard komandi za samoisceljenje (AI Patch okidač)
    const replyMarkup = poslateTelegramPoruke[0].reply_markup;
    expect(replyMarkup.inline_keyboard[0][1].text).toBe("🚀 Pokreni AI Patch");
    expect(replyMarkup.inline_keyboard[0][1].callback_data).toBe(`ai_patch_trigger:${brojDokumenta}`);
  });

  // =========================================================================
  // 🔬 TEST SCENARIO 2: LJUDSKA GREŠKA (ODBRANA OD LAŽNIH UZBUNA)
  // =========================================================================
  it('FAIL-SAFE: Ako klijent pošalje standardno lošu fakturu, AI ne aktivira štit', async () => {
    // Klijent je pogrešio dužinu PIB-a, to nije državni hotfix već standardni loš unos
    const simuliraniSefOdgovor = new Response(
      "Receiver PIB '123' is invalid length", 
      { status: 400 }
    );

    await handleSefErrorWithEdgeAi(
      simuliraniSefOdgovor,
      "id_lokalni",
      "FKT-LJUDSKA-GRESKA",
      "<xml></xml>",
      mockEnv,
      mockCtx
    );

    // Queue i Telegram kanali moraju ostati netaknuti (Nema lažnih uzbuna na telefonima tima)
    expect(upisanePorukeUQueue).toHaveLength(0);
    expect(poslateTelegramPoruke).toHaveLength(0);
    expect(kvStore.has("ALERT_SEF_HOTFIX_DETECTED")).toBe(false);
  });

  // =========================================================================
  // 🔬 TEST SCENARIO 3: CIRCUIT BREAKER OSIGURAČ (PAD AI SERVISA)
  // =========================================================================
  it('🚨 CIRCUIT BREAKER: Tri uzastopna pada AI servisa otvaraju osigurač i aktiviraju fast-path bypass', async () => {
    const simuliraniSefOdgovor = new Response("Error payload", { status: 400 });

    // 1. Simulišemo pad AI API servisa (npr. baca fatalnu 503 grešku)
    mockEnv.AI.run = vi.fn().mockRejectedValue(new Error("Cloudflare AI is down (503 Service Unavailable)"));

    // Prvi neuspeh
    await handleSefErrorWithEdgeAi(simuliraniSefOdgovor.clone(), "id1", "FKT-1", "", mockEnv, mockCtx);
    expect(kvStore.get("CF_AI_FAILURE_COUNT")).toBe("1");
    expect(kvStore.get("CF_AI_CIRCUIT_STATE")).toBeUndefined(); // Još uvek je CLOSED (podrazumevano)

    // Drugi neuspeh
    await handleSefErrorWithEdgeAi(simuliraniSefOdgovor.clone(), "id2", "FKT-2", "", mockEnv, mockCtx);
    expect(kvStore.get("CF_AI_FAILURE_COUNT")).toBe("2");

    // Treći neuspeh -> Ovde osigurač MORA da se otvori!
    await handleSefErrorWithEdgeAi(simuliraniSefOdgovor.clone(), "id3", "FKT-3", "", mockEnv, mockCtx);
    expect(kvStore.get("CF_AI_FAILURE_COUNT")).toBe("3");
    expect(kvStore.get("CF_AI_CIRCUIT_STATE")).toBe("OPEN");
    
    const suspendedUntilRaw = kvStore.get("CF_AI_SUSPENDED_UNTIL");
    expect(suspendedUntilRaw).not.toBeUndefined();
    const suspendedUntil = parseInt(suspendedUntilRaw!, 10);
    expect(suspendedUntil).toBeGreaterThan(Date.now());

    // 2. Kada je osigurač OTVOREN, pozivi se automatski zaobilaze (Fast-path bypass)
    // Resetujemo brojač poziva Llama-3 modela
    mockEnv.AI.run = vi.fn();
    
    await handleSefErrorWithEdgeAi(simuliraniSefOdgovor.clone(), "id4", "FKT-4", "", mockEnv, mockCtx);
    
    // Dokaz da Workers AI uopšte nije bio pozvan (Fast path zaštita resursa)
    expect(mockEnv.AI.run).not.toHaveBeenCalled();
  });

  // =========================================================================
  // 🔬 TEST SCENARIO 4: CIRCUIT BREAKER AUTOMATSKO ZATVARANJE (OPORAVAK)
  // =========================================================================
  it('🟢 CIRCUIT BREAKER: Uspešan AI poziv resetuje osigurač na CLOSED status', async () => {
    // Postavljamo početno stanje: 2 greške
    kvStore.set("CF_AI_FAILURE_COUNT", "2");

    const simuliraniSefOdgovor = new Response("Error payload", { status: 400 });

    // AI je uspešno proradio
    mockEnv.AI.run = vi.fn().mockResolvedValue({
      response: JSON.stringify({ tip: "STANDARD_REJECTION", akcija: "REJECT" })
    });

    await handleSefErrorWithEdgeAi(simuliraniSefOdgovor, "id_test", "FKT-TEST", "", mockEnv, mockCtx);

    // Osigurač je zatvoren, a brojač grešaka je resetovan na 0
    expect(kvStore.get("CF_AI_CIRCUIT_STATE")).toBe("CLOSED");
    expect(kvStore.get("CF_AI_FAILURE_COUNT")).toBe("0");
    expect(kvStore.get("CF_AI_SUSPENDED_UNTIL")).toBeUndefined();
  });
});
