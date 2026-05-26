import { DurableObject } from "cloudflare:workers";

export interface Env {
  INVOICE_STATE: DurableObjectNamespace<InvoiceStateDO>;
  AI: any;
  REGISTAR_DB: D1Database;
}

export class InvoiceStateDO extends DurableObject<Env> {
  async transition(invoiceId: string, action: 'APPROVED' | 'REJECTED'): Promise<{ success: boolean; status: string; error?: string }> {
    // 1. Provera trenutnog statusa u D1 bazi
    const currentInvoice = await this.env.REGISTAR_DB.prepare(
      "SELECT status FROM fakture WHERE internal_id = ? OR sef_id = ?"
    ).bind(invoiceId, invoiceId).first<{ status: string }>();

    if (!currentInvoice) return { success: false, status: 'NOT_FOUND', error: "Faktura nije pronađena." };
    
    // Ako je faktura već finalizovana, blokiramo retroaktivne izmene
    if (currentInvoice.status === 'REJECTED' || currentInvoice.status === 'APPROVED' || currentInvoice.status === 'Cancelled') {
      return { success: false, status: currentInvoice.status, error: "Stanje je već finalizovano." };
    }

    const noviStatus = action === 'REJECTED' ? 'REJECTED' : 'APPROVED';

    // 2. Ažuriranje lokalne D1 baze
    await this.env.REGISTAR_DB.prepare(
      "UPDATE fakture SET status = ?, azurirano_u = CURRENT_TIMESTAMP WHERE internal_id = ? OR sef_id = ?"
    ).bind(noviStatus, invoiceId, invoiceId).run();

    // 3. 🌐 AUTOMATSKI SYNC SA SEF-om (Ovdje bi išao poziv ka SefClient-u)
    if (noviStatus === 'REJECTED') {
      console.log(`🌐 [SEF-SYNC] Faktura ${invoiceId} označena kao REJECTED lokalno. Potreban SEF Cancel.`);
    }

    return { success: true, status: noviStatus };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/transition') {
      const { invoiceId, action } = await request.json() as any;
      const result = await this.transition(invoiceId, action);
      return Response.json(result, { status: result.success ? 200 : 400 });
    }
    return new Response("Not Found", { status: 404 });
  }
}

export default {
  async email(message: any, env: Env, ctx: ExecutionContext): Promise<void> {
    // 1. Ekstrakcija ID-ja fakture iz naslova (npr. Naslov: "Re: eFaktura [KON-2026-1024]")
    const subject = message.headers.get('subject') || '';
    const match = subject.match(/\[(.*?)\]/);
    if (!match) {
      console.log('❌ [INBOUND] Mejl nema validan ID fakture u naslovu.');
      return;
    }
    const invoiceId = match[1];

    // 2. Čitanje sirovog teksta mejla
    const rawText = await streamToString(message.raw);

    // 3. 🤖 Cloudflare Workers AI - Prepoznavanje namere
    const aiPrompt = `Analiziraj sledeći odgovor kupca na primljenu fakturu. 
    Kategoriši nameru isključivo jednom od sledećih reči: APPROVED (ako prihvata ili potvrđuje), REJECTED (ako odbija, žali se ili traži storno), UNKNOWN (ako je upit ili nejasno).
    Tekst mejla: "${rawText}"
    Kategorija:`;

    try {
      const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
        prompt: aiPrompt,
        max_tokens: 10,
        temperature: 0.0
      });

      const intent = aiResponse.result.trim().toUpperCase();
      console.log(`🤖 [AI ANALIZA] Prepoznata namera za ${invoiceId}: ${intent}`);

      // 4. Prosleđivanje komande u Durable Object
      if (intent === 'REJECTED' || intent === 'APPROVED') {
        const doId = env.INVOICE_STATE.idFromName(invoiceId);
        const doStub = env.INVOICE_STATE.get(doId);
        
        await doStub.fetch(`http://state/transition`, {
          method: 'POST',
          body: JSON.stringify({ invoiceId, action: intent })
        });
      }
    } catch (e) {
      console.error('🚨 [AI-FAIL] Greška pri analizi namere:', e);
    }
  }
};

async function streamToString(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}
