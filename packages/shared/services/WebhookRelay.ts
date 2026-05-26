export interface WebhookPayload {
  event: string;
  pibKupca: string;
  data: any;
}

export class WebhookRelay {
  /**
   * 🛡️ Generiše HMAC-SHA256 potpis za payload koristeći tajni ključ klijenta
   */
  static async generateSignature(payload: any, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const payloadData = encoder.encode(JSON.stringify(payload));

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, payloadData);
    
    // Konverzija u Base64 (Cloudflare kompatibilno)
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  }

  /**
   * 🛰️ Šalje webhook na eksterni URL sa potpisom
   */
  static async deliver(payload: WebhookPayload, url: string, secret: string): Promise<Response> {
    const signature = await this.generateSignature(payload, secret);

    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SEF-Signature': signature,
        'User-Agent': 'SEF-Bridge-Webhook-Engine/v1.0'
      },
      body: JSON.stringify(payload),
      // @ts-ignore - signal: AbortSignal.timeout(8000) is supported in modern environments
      signal: AbortSignal.timeout(8000)
    });
  }
}
