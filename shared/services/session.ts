/**
 * SEF Bridge - Titanium Session Engine (Edge-Native)
 * Implementira Atinux-ov "Sealed Session" standard koristeći AES-256-GCM.
 */

export interface SessionData {
  klijentId: string;
  pib: string;
  operater: string;
  createdAt: number;
}

export class SessionEngine {
  private static ALGO = 'AES-GCM';
  private static KEY_SIZE = 256;

  /**
   * Generiše kriptografski ključ iz tvoje SESSION_SECRET lozinke.
   */
  private static async deriveKey(password: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const pwBytes = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', pwBytes);
    return crypto.subtle.importKey('raw', hash, { name: this.ALGO }, false, ['encrypt', 'decrypt']);
  }

  /**
   * "Zapečati" sesiju - Enkriptuje i potpisuje podatke.
   */
  static async seal(data: SessionData, password: string): Promise<string> {
    const key = await this.deriveKey(password);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(JSON.stringify(data));

    const ciphertext = await crypto.subtle.encrypt(
      { name: this.ALGO, iv },
      key,
      encodedData
    );

    // Pakujemo: IV + Ciphertext u jedan Base64 string
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);

    // Konverzija u Base64 bez Node.js Buffer-a
    let binary = '';
    const bytes = new Uint8Array(combined);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * "Otključava" sesiju - Verifikuje integritet i dešifruje podatke.
   */
  static async unseal(sealed: string, password: string): Promise<SessionData | null> {
    try {
      const key = await this.deriveKey(password);
      
      // Dekodiranje Base64
      const binary = atob(sealed);
      const combined = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        combined[i] = binary.charCodeAt(i);
      }

      const iv = combined.slice(0, 12);
      const ciphertext = combined.slice(12);

      const decrypted = await crypto.subtle.decrypt(
        { name: this.ALGO, iv },
        key,
        ciphertext
      );

      return JSON.parse(new TextDecoder().decode(decrypted));
    } catch (err) {
      console.error('[Session] Neuspešno otključavanje sesije (Invalid key or tampered data)');
      return null;
    }
  }
}
