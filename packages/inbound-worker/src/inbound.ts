import { DurableObject } from "cloudflare:workers";
import PostalMime from 'postal-mime';
import { XMLParser } from 'fast-xml-parser';

export interface Env {
  INVOICE_STATE: DurableObjectNamespace<InvoiceStateDO>;
  AI: any;
  REGISTAR_DB: D1Database;
  WEBHOOK_QUEUE: Queue<any>;
}

export class InvoiceStateDO extends DurableObject<Env> {
  async transition(invoiceId: string, action: 'APPROVED' | 'REJECTED'): Promise<{ success: boolean; status: string; error?: string }> {
    const currentInvoice = await this.env.REGISTAR_DB.prepare(
      "SELECT status FROM fakture WHERE internal_id = ? OR sef_id = ?"
    ).bind(invoiceId, invoiceId).first<{ status: string }>();

    if (!currentInvoice) return { success: false, status: 'NOT_FOUND', error: "Faktura nije pronađena." };
    
    if (currentInvoice.status === 'REJECTED' || currentInvoice.status === 'APPROVED' || currentInvoice.status === 'Cancelled') {
      return { success: false, status: currentInvoice.status, error: "Stanje je već finalizovano." };
    }

    const noviStatus = action === 'REJECTED' ? 'REJECTED' : 'APPROVED';

    await this.env.REGISTAR_DB.prepare(
      "UPDATE fakture SET status = ?, azurirano_u = CURRENT_TIMESTAMP WHERE internal_id = ? OR sef_id = ?"
    ).bind(noviStatus, invoiceId, invoiceId).run();

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
    const parser = new PostalMime();
    const email = await parser.parse(message.raw);
    
    // --- 1. HANDLING REPLIES (Intent Classification) ---
    const subject = email.subject || '';
    const match = subject.match(/\[(.*?)\]/);
    if (match) {
      const invoiceId = match[1];
      const rawText = email.text || '';
      
      if (rawText.length > 10) {
        const aiPrompt = `Analiziraj sledeći odgovor kupca na primljenu fakturu. 
        Kategoriši nameru isključivo jednom od sledećih reči: APPROVED (ako prihvata ili potvrđuje), REJECTED (ako odbija, žali se ili traži storno), UNKNOWN (ako je upit ili nejasno).
        Tekst mejla: "${rawText.substring(0, 1000)}"
        Kategorija:`;

        try {
          const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
            prompt: aiPrompt,
            max_tokens: 10,
            temperature: 0.0
          });

          const intent = aiResponse.result.trim().toUpperCase();
          console.log(`🤖 [AI ANALIZA] Prepoznata namera za ${invoiceId}: ${intent}`);

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
    }

    // --- 2. HANDLING FORWARDED INVOICES (Email-to-UBL/OCR) ---
    const toAddress = message.to;
    if (toAddress.includes('@inbox.')) {
      const pibKupca = toAddress.split('@')[0].replace('pib', '');
      console.log(`📥 [INBOUND-PARSER] Primljen mejl za kupca sa PIB-om: ${pibKupca}`);

      if (email.attachments && email.attachments.length > 0) {
        for (const attachment of email.attachments) {
          const filename = (attachment.filename || '').toLowerCase();

          if (filename.endsWith('.xml')) {
            console.log(`📄 [XML DETEKTOVAN] Parsiram UBL za ${filename}`);
            const xmlText = new TextDecoder().decode(attachment.content);
            await parseAndSaveUbl(xmlText, pibKupca, env);
          } 
          else if (filename.endsWith('.pdf')) {
            console.log(`🖼️ [PDF DETEKTOVAN] Pokrećem AI OCR za ${filename}`);
            // U ovom demo-u samo logujemo, jer puni OCR zahteva kompleksniju obradu slika
            // ali simuliramo AI ekstrakciju
            await parseAndSavePdfViaAi("Fiktivni tekst iz PDF-a", pibKupca, env);
          }
        }
      }
    }
  }
};

async function parseAndSaveUbl(xmlText: string, pibKupca: string, env: Env) {
  const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true });
  const jsonObj = parser.parse(xmlText);

  const invoice = jsonObj?.Envelope?.Body?.Invoice || jsonObj?.Invoice;
  if (!invoice) return;

  const brojRacuna = invoice.ID;
  const pibProdavca = invoice.AccountingSupplierParty?.Party?.PartyTaxScheme?.CompanyID?.replace('RS', '') || 'UNKNOWN';
  const nazivProdavca = invoice.AccountingSupplierParty?.Party?.PartyLegalEntity?.RegistrationName || 'Nepoznat Dobavljač';
  const ukupno = parseFloat(invoice.LegalMonetaryTotal?.PayableAmount || 0);

  await env.REGISTAR_DB.prepare(`
    INSERT INTO ulazni_troskovi (broj_racuna, pib_prodavca, naziv_prodavca, pib_kupca, iznos, tip_unosa, status)
    VALUES (?, ?, ?, ?, ?, 'UBL_XML', 'POTVRDJENO')
  `).bind(brojRacuna, pibProdavca, nazivProdavca, pibKupca, ukupno).run();

  // 🚀 Gurnemo u red za Webhook Relej
  await env.WEBHOOK_QUEUE.send({
    event: "invoice.received",
    pibKupca: pibKupca,
    data: { broj_racuna: brojRacuna, pib_prodavca: pibProdavca, naziv_prodavca: nazivProdavca, iznos: ukupno, tip_unosa: "UBL_XML" }
  });

  console.log(`✅ [UBL-USPEH] Račun ${brojRacuna} od ${nazivProdavca} uvezen.`);
}

async function parseAndSavePdfViaAi(siroviTekst: string, pibKupca: string, env: Env) {
  const aiPrompt = `Izvuci podatke iz ovog teksta računa i vrati ih ISKLJUČIVO kao čist JSON objekat.
  Format: {"broj": "string", "pib_prodavca": "string", "naziv": "string", "iznos": broj}
  Tekst: "${siroviTekst}"`;

  try {
    const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
      prompt: aiPrompt,
      temperature: 0.0
    });

    const res = aiResponse.result.trim();
    const jsonStart = res.indexOf('{');
    const jsonEnd = res.lastIndexOf('}') + 1;
    const cistJson = JSON.parse(res.substring(jsonStart, jsonEnd));

    await env.REGISTAR_DB.prepare(`
      INSERT INTO ulazni_troskovi (broj_racuna, pib_prodavca, naziv_prodavca, pib_kupca, iznos, tip_unosa, status)
      VALUES (?, ?, ?, ?, ?, 'AI_OCR', 'POTREBNA_POTVRDA')
    `).bind(cistJson.broj, cistJson.pib_prodavca, cistJson.naziv, pibKupca, cistJson.iznos).run();

    // 🚀 Gurnemo u red za Webhook Relej (kao draft koji čeka potvrdu)
    await env.WEBHOOK_QUEUE.send({
      event: "invoice.draft_received",
      pibKupca: pibKupca,
      data: { broj_racuna: cistJson.broj, pib_prodavca: cistJson.pib_prodavca, naziv_prodavca: cistJson.naziv, iznos: cistJson.iznos, tip_unosa: "AI_OCR" }
    });

    console.log(`🤖 [AI-OCR-USPEH] Detektovan račun ${cistJson.broj}. Čeka potvrdu.`);
  } catch (err) {
    console.error('🚨 [AI-PARSER-FAIL] Greška:', err);
  }
}
