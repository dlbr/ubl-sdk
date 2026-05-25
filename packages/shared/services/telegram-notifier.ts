/**
 * Telegram ChatOps Notifier
 * 
 * Služi za asinhrono slanje bogatih (HTML) upozorenja sa interaktivnim tasterima
 * kada Edge AI detektuje kritičnu sistemsku promenu (BREAKING_HOTFIX).
 */

export async function posaljiHotfixTelegramAlarm(
  sirovaGreska: string,
  brojDokumenta: string,
  env: any
) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  
  if (!token || !chatId) {
    console.log("[Telegram] Preskačem slanje alarma: nedostaju TELEGRAM_BOT_TOKEN ili TELEGRAM_CHAT_ID.");
    return;
  }

  const skracenaGreska = sirovaGreska.length > 300 
    ? sirovaGreska.substring(0, 300) + "..." 
    : sirovaGreska;

  // Formatiramo brutalno preglednu poruku za inženjere
  const tekstPoruke = `
🚨 <b>[SEF ALARM] Detektovan potencijalni državni Hotfix!</b>
--------------------------------------------------
<b>Lokacija:</b> Cloudflare Edge Node (Circuit Breaker)
<b>Dokument:</b> <code>${brojDokumenta}</code>
<b>Vreme:</b> ${new Date().toLocaleString('sr-RS')}

<b>⚠️ Sirova greška sa SEF-a:</b>
<code>${skracenaGreska}</code>

--------------------------------------------------
🛡️ <i>Sistem je automatski aktivirao Circuit Breaker. Fakture ovog tipa su prebačene u Queue štit.</i>
  `.trim();

  // Dodajemo interaktivnu tastaturu (Inline Buttons) direktno u ćaskanje
  const inlineTastatura = {
    inline_keyboard: [
      [
        { 
          text: "🔍 Pogledaj ceo log", 
          url: `https://dash.cloudflare.com/` 
        },
        { 
          text: "🚀 Pokreni AI Patch", 
          callback_data: `ai_patch_trigger:${brojDokumenta}` 
        }
      ],
      [
        { 
          text: "🔓 Isključi osigurač (Force Bypass)", 
          callback_data: "force_bypass_breaker" 
        }
      ]
    ]
  };

  try {
    // Ispaljujemo zahtev ka zvaničnom Telegram Bot API-ju
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: tekstPoruke,
        parse_mode: "HTML",
        reply_markup: inlineTastatura
      })
    });
    
    if (!res.ok) {
       console.error("[Telegram Error] Neuspešno slanje poruke:", await res.text());
    } else {
       console.log(`[Telegram] Uspešno poslat alarm za dokument ${brojDokumenta}.`);
    }
  } catch (err: any) {
    console.error("[Telegram Exception] Došlo je do greške pri mrežnom pozivu ka Telegramu:", err.message);
  }
}
