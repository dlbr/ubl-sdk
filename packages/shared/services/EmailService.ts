export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{
    name: string;
    data: ArrayBuffer;
    type: string;
  }>;
}

export class EmailService {
  /**
   * 🚀 Šalje e-mail koristeći nativni Cloudflare Email Sending API
   */
  static async send(env: any, message: EmailMessage): Promise<{ success: boolean; error?: string }> {
    try {
      if (!env.EMAIL) {
        throw new Error('Cloudflare EMAIL binding nije konfigurisan.');
      }

      await env.EMAIL.send(message);
      console.log(`🟢 [EMAIL-SERVICE] Mejl uspešno poslat na ${message.to}`);
      return { success: true };
    } catch (error: any) {
      console.error(`🚨 [EMAIL-SERVICE-FAIL] Greška pri slanju mejla na ${message.to}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 📧 Pomoćna metoda za slanje eFakture sa PDF prilogom
   */
  static async sendInvoice(
    env: any, 
    emailKupca: string, 
    brojFakture: string, 
    pdfBuffer: ArrayBuffer,
    senderEmail: string = "no-reply@sef-bridge.rs"
  ) {
    return this.send(env, {
      to: emailKupca,
      from: senderEmail,
      subject: `Stigla vam je eFaktura br. ${brojFakture}`,
      text: `Poštovani, u prilogu vam dostavljamo zvanični državni PDF dokument za eFakturu ${brojFakture}.`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #059669;">Nova eFaktura: ${brojFakture}</h2>
          <p>Zvanični državni PDF i XML dokumenti su uspešno procesuirani i nalaze se u prilogu ovog mejla.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <small style="color: #666;">Ovaj mejl je automatski generisan preko SEF-Bridge platforme koristeći Cloudflare Email Service.</small>
        </div>
      `,
      attachments: [
        {
          name: `eFaktura_${brojFakture}.pdf`,
          data: pdfBuffer,
          type: 'application/pdf'
        }
      ]
    });
  }
}
