import { posaljiHotfixTelegramAlarm } from '../shared/services/telegram-notifier';

/**
 * handleSefErrorWithEdgeAi - Intelligent error classification at the Edge.
 * 
 * v4.2.1: Modularized for reuse and high-fidelity testing.
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
    // Pokretanje ugrađenog modela na Cloudflare GPU infrastrukturi (<50ms)
    // NAPOMENA: env.AI mora biti dostupan (Workers AI binding)
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
      // 1. Podigni globalnu rampu u Cloudflare KV-u za ovaj tip greške
      await env.PORESKI_KV.put("ALERT_SEF_HOTFIX_DETECTED", JSON.stringify({
        status: "POTREBNA_INSPEKCIJA",
        vreme: new Date().toISOString(),
        uzrok: sirovaGreska
      }));

      // 2. Bezbedno gurni XML u Cloudflare Queue (Asinhroni štit)
      if (env.SEF_QUEUE) {
        await env.SEF_QUEUE.send({
          id: lokalniId,
          broj: brojDokumenta,
          xml: xmlSadrzaj,
          klijentId: klijentId || 'UNK'
        });
      }

      // 3. KLJUČNI ASINHRONI KORAK: Obaveštavamo tim na Telegram bez blokiranja klijenta
      if (ctx?.waitUntil) {
        ctx.waitUntil(posaljiHotfixTelegramAlarm(sirovaGreska, brojDokumenta, env));
      } else {
        // Fallback za testno okruženje gde ctx možda nije prisutan
        await posaljiHotfixTelegramAlarm(sirovaGreska, brojDokumenta, env);
      }

      // 4. Vrati klijentu 202 Accepted — ERP ostaje miran, krediti su rezervisani i sigurni
      return new Response(JSON.stringify({
        success: true,
        status: "QUEUED_FOR_COMPLIANCE",
        message: "Državni SEF portal prolazi kroz vanredne tehničke izmene (Hotfix). Vaš dokument je uspešno prebačen u asinhroni štit i biće automatski procesuiran čim sistem sinhronizuje novu šemu."
      }), { status: 202, headers: { "Content-Type": "application/json" } });
    }

  } catch (err: any) {
    console.error("[Edge AI Fail-Safe] Pad AI podsistema, vraćam sirovu grešku:", err.message);
  }

  // Ako AI proceni da je greška standardna (npr. klijent loše ukucao PIB primaoca), vrati mu standardni 400
  return new Response(sirovaGreska, { status: 400 });
}
