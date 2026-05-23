/**
 * SEF Compliance Watcher v1.0 (v3.9.0 System Integration)
 * 
 * Automatski prati zvanični SEF portal za izmene tehničke dokumentacije,
 * verzije i hitne ispravke. Služi kao rani sistem uzbunjivanja za dev tim.
 */

export interface Env {
  PORESKI_KV: KVNamespace;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  SEF_UBL_ARHIVA?: R2Bucket; // Optional for watcher
  INVOICE_QUEUE?: Queue;
  AI?: any;
  SEF_QUEUE?: Queue;
  ADMIN_API_KEY?: string;
}

interface SefUpdate {
  title: string;
  link: string;
  date: string;
  isHotfix: boolean;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(this.checkSefUpdates(env));
  },

  async checkSefUpdates(env: Env): Promise<void> {
    const SEF_URL = "https://www.efaktura.gov.rs/tekst/5421/sef-azuriranja-i-verzije.php";
    console.log(`[Compliance Watcher] Započinjem skrapovanje SEF portala...`);

    try {
      const response = await fetch(SEF_URL, {
        headers: { "User-Agent": "SEF-Compliance-Bot/1.0 (Cloudflare Worker)" }
      });

      if (!response.ok) {
        throw new Error(`Državni portal nedostupan: HTTP ${response.status}`);
      }

      const html = await response.text();
      const updates: SefUpdate[] = [];

      // 1. Ekstrakcija linkova i vesti pomoću HTMLRewriter-a (najsigurnije na Edge-u)
      await new HTMLRewriter()
        .on('a[href*=".pdf"], a[href*="tekst"]', {
          element(el) {
            const href = el.getAttribute("href") || "";
            // Filtriramo samo relevantne linkove
            if (href.includes("verzija") || href.includes("uputstvo") || href.includes("izmene")) {
              updates.push({
                title: "", // Popunjava se u text() handleru
                link: href.startsWith("http") ? href : `https://www.efaktura.gov.rs${href}`,
                date: new Date().toLocaleDateString('sr-RS'),
                isHotfix: false
              });
            }
          },
          text(text) {
            const lastUpdate = updates[updates.length - 1];
            if (lastUpdate && !lastUpdate.title) {
              lastUpdate.title += text.text.trim();
            }
          }
        })
        .transform(new Response(html))
        .text();

      if (updates.length === 0) {
        console.log("[Compliance Watcher] Nema detektovanih vesti na stranici.");
        return;
      }

      // Analiziramo najnoviju vest
      const latestUpdate = updates[0];
      if (!latestUpdate) return;
      
      const criticalKeywords = ["hotfix", "izmena šeme", "prekid rada", "obavezno", "hitno"];
      latestUpdate.isHotfix = criticalKeywords.some(kw => latestUpdate.title.toLowerCase().includes(kw));

      // 2. State Management (Detekcija promene pomoću Hash-a)
      const contentHash = await this.generateHash(latestUpdate.title + latestUpdate.link);
      const lastHash = await env.PORESKI_KV.get("ZADNJA_POZNATA_SEF_VERZIJA");

      if (contentHash === lastHash) {
        console.log("[Compliance Watcher] Nema novih promena od poslednje provere.");
        return;
      }

      // 3. Sistem uzbunjivanja (Telegram)
      await this.sendTelegramAlert(env, latestUpdate);

      // 4. Circuit Breaker aktivacija (ako je kritično)
      if (latestUpdate.isHotfix) {
        await env.PORESKI_KV.put("ALERT_SEF_HOTFIX_DETECTED", "POTREBNA_INSPEKCIJA", { expirationTtl: 86400 });
        console.warn("[Circuit Breaker] Detektovan Hotfix! Flag postavljen u KV.");
      }

      // Sačuvaj novo stanje
      await env.PORESKI_KV.put("ZADNJA_POZNATA_SEF_VERZIJA", contentHash);
      console.log(`[Compliance Watcher] Uspešno procesirana nova vest: ${latestUpdate.title}`);

    } catch (error: any) {
      console.error(`[Compliance Watcher Error] ${error.message}`);
    }
  },

  async generateHash(input: string): Promise<string> {
    const msgUint8 = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  },

  async sendTelegramAlert(env: Env, update: SefUpdate): Promise<void> {
    const botToken = env.TELEGRAM_BOT_TOKEN;
    const chatId = env.TELEGRAM_CHAT_ID;
    
    if (!botToken || !chatId) {
      console.error("[Telegram] Nedostaju kredencijali za slanje notifikacije.");
      return;
    }

    const message = `
🚨 *SEF COMPLIANCE ALERT* 🚨

*Naslov:* ${update.title}
*Datum detekcije:* ${update.date}
*Tip:* ${update.isHotfix ? "🔥 HITNA IZMENA (Hotfix)" : "📄 Redovno ažuriranje"}

[Pogledaj dokumentaciju ovde](${update.link})

⚠️ _Pažnja: Ukoliko je tip Hotfix, automatski Circuit Breaker je aktiviran na API Gateway-u._
    `.trim();

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
        disable_web_page_preview: false
      })
    });
  }
};
