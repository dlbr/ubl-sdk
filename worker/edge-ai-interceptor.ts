import { posaljiHotfixTelegramAlarm } from '../shared/services/telegram-notifier';

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
): Promise<Response> {
  
  const sirovaGreska = await sefResponse.text();
  console.warn(`[Edge Alert] SEF odbio dokument ${brojDokumenta}. Pokrećem Llama-3 analizu...`);

  try {
    // 🛡️ HERMETIČKI ŠTIT: Ako AI podsistem nije dostupan (npr. lokalni Miniflare bez AI bindinga),
    // ne dozvoljavamo krahiranje workerd-a.
    if (!env.AI) {
      throw new Error("AI subsystem not bound to environment.");
    }

    const aiOdlukaRaw = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
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

      return new Response(JSON.stringify({
        success: true,
        status: "QUEUED_FOR_COMPLIANCE",
        message: "Državni SEF portal prolazi kroz vanredne tehničke izmene. Dokument je u asinhronom štitu."
      }), { status: 202, headers: { "Content-Type": "application/json" } });
    }

  } catch (err: any) {
    // 🛡️ FAIL-SAFE: AI je pao, vraćamo originalnu grešku bez rušenja procesa
    console.error("⚠️ [Edge AI Fail-Safe] AI podsistem nedostupan usled mrežnog prekida. Vraćam sirovu grešku.");
    return new Response(sirovaGreska, { status: 400 });
  }

  return new Response(sirovaGreska, { status: 400 });
}
