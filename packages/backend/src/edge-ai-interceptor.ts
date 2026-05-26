import { posaljiHotfixTelegramAlarm } from '@sef/shared/services/telegram-notifier';

/**
 * handleSefErrorWithEdgeAi - Intelligent error classification at the Edge.
 * 
 * v4.4.3: Hardened with robust fail-safes to prevent workerd process crashes.
 */
export async function handleSefErrorWithEdgeAi(
  sefResponse: Response,
  lokalniId: string,
  brojDokumenta: string,
  xmlSadrzaj: string,
  env: any,
  ctx: any,
  klijentId?: string
): Promise<void> {
  
  const sirovaGreska = await sefResponse.text();
  console.warn(`[Edge Alert] SEF odbio dokument ${brojDokumenta}. Pokrećem Llama-3 analizu...`);

  // 1. Provera Circuit Breaker-a pre nego što išta uradimo
  if (env.PORESKI_KV) {
    try {
      const state = await env.PORESKI_KV.get("CF_AI_CIRCUIT_STATE");
      if (state === "OPEN") {
        const suspendedUntilRaw = await env.PORESKI_KV.get("CF_AI_SUSPENDED_UNTIL");
        if (suspendedUntilRaw) {
          const suspendedUntil = parseInt(suspendedUntilRaw, 10);
          if (Date.now() < suspendedUntil) {
            console.warn(`[Edge AI Circuit Breaker] Circuit is OPEN (suspended). Bypassing AI analysis until ${new Date(suspendedUntil).toISOString()}.`);
            return;
          } else {
            console.log("[Edge AI Circuit Breaker] Suspension expired. Transitioning to HALF-OPEN.");
            await env.PORESKI_KV.put("CF_AI_CIRCUIT_STATE", "HALF-OPEN");
          }
        }
      }
    } catch (kvErr) {
      console.error("[Edge AI Circuit Breaker] Greška prilikom čitanja statusa iz KV-a:", kvErr);
    }
  }

  // 2. Provera AI binding-a
  if (!env.AI) {
    console.warn("⚠️ [Edge AI Interceptor] AI subsystem not bound to environment. Bypassing.");
    return;
  }

  try {
    // 3. Pokretanje AI poziva sa 800ms limitom (Promise.race)
    const runAiPromise = env.AI.run('@cf/meta/llama-3-8b-instruct', {
      messages: [
        {
          role: "system",
          content: "Ti si JSON ruter za e-Fakture Srbija. Analiziraj grešku državnog servera i vrati ISKLJUČIVO čist JSON objekat sa poljima: 'tip' (vrednosti: BREAKING_HOTFIX, STANDARD_REJECTION) i 'akcija' (vrednosti: QUEUE, REJECT)."
        },
        {
          role: "user",
          content: `Sirova greška sa SEF-a: ${sirovaGreska}`
        }
      ],
      response_format: { type: "json_object" }
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("AI_TIMEOUT")), 800)
    );

    const aiOdlukaRaw = await Promise.race([runAiPromise, timeoutPromise]) as any;

    // 4. Uspeh AI poziva -> Zatvaranje/Resetovanje Circuit Breakera
    if (env.PORESKI_KV) {
      await env.PORESKI_KV.put("CF_AI_CIRCUIT_STATE", "CLOSED");
      await env.PORESKI_KV.put("CF_AI_FAILURE_COUNT", "0");
      await env.PORESKI_KV.delete("CF_AI_SUSPENDED_UNTIL");
    }

    const odluka = JSON.parse(aiOdlukaRaw.response);

    if (odluka.tip === "BREAKING_HOTFIX" || odluka.akcija === "QUEUE") {
      // 1. Podigni globalnu rampu u Cloudflare KV-u
      if (env.PORESKI_KV) {
        await env.PORESKI_KV.put("ALERT_SEF_HOTFIX_DETECTED", JSON.stringify({
          status: "POTREBNA_INSPEKCIJA",
          vreme: new Date().toISOString(),
          uzrok: sirovaGreska
        }));
      }

      // 2. XML u Cloudflare Queue (Asinhroni štit)
      if (env.SEF_QUEUE) {
        await env.SEF_QUEUE.send({
          id: lokalniId,
          broj: brojDokumenta,
          xml: xmlSadrzaj,
          klijentId: klijentId || 'UNK'
        });
      }

      // 3. Obaveštavamo tim na Telegram (Asinhrono)
      if (ctx?.waitUntil) {
        ctx.waitUntil(posaljiHotfixTelegramAlarm(sirovaGreska, brojDokumenta, env));
      } else {
        await posaljiHotfixTelegramAlarm(sirovaGreska, brojDokumenta, env);
      }
    }

  } catch (err: any) {
    // 5. Greška ili Timeout -> Evidentiranje u Circuit Breaker
    console.error(`⚠️ [Edge AI Fail-Safe] AI poziv neuspešan: ${err.message}`);
    
    if (env.PORESKI_KV) {
      try {
        const currentFailuresRaw = await env.PORESKI_KV.get("CF_AI_FAILURE_COUNT") || "0";
        const newFailures = parseInt(currentFailuresRaw, 10) + 1;
        await env.PORESKI_KV.put("CF_AI_FAILURE_COUNT", newFailures.toString());

        if (newFailures >= 3) {
          console.error(`🚨 [Edge AI Circuit Breaker] Detektovano ${newFailures} uzastopnih grešaka. OTVARAM OSIGURAČ na 30 minuta!`);
          await env.PORESKI_KV.put("CF_AI_CIRCUIT_STATE", "OPEN");
          await env.PORESKI_KV.put("CF_AI_SUSPENDED_UNTIL", (Date.now() + 30 * 60 * 1000).toString());
        }
      } catch (kvErr) {
        console.error("[Edge AI Circuit Breaker] Greška prilikom ažuriranja osigurača u KV-u:", kvErr);
      }
    }
  }
}
