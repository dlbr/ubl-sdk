/**
 * SEF Bridge - Edge Auth Engine
 * Implementira PBKDF2 hesiranje lozinki koristeći nativni Web Crypto API.
 */

export class AuthEngine {
  private static ITERATIONS = 100000;
  private static ALGO = 'SHA-256';

  /**
   * Kreira siguran hash lozinke sa nasumičnim salt-om.
   * Format: salt.hash (Base64)
   */
  static async hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const pwKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    const hashBuffer = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations: this.ITERATIONS,
        hash: this.ALGO,
      },
      pwKey,
      256
    );

    const saltB64 = btoa(String.fromCharCode(...salt));
    const hashB64 = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));

    return `${saltB64}.${hashB64}`;
  }

  /**
   * Verifikuje lozinku naspram sačuvanog hash-a.
   */
  static async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    try {
      const [saltB64, hashB64] = storedHash.split('.');
      if (!saltB64 || !hashB64) return false;

      const encoder = new TextEncoder();
      const salt = new Uint8Array(atob(saltB64).split('').map(c => c.charCodeAt(0)));
      
      const pwKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
      );

      const derivedBuffer = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt,
          iterations: this.ITERATIONS,
          hash: this.ALGO,
        },
        pwKey,
        256
      );

      const derivedB64 = btoa(String.fromCharCode(...new Uint8Array(derivedBuffer)));
      return derivedB64 === hashB64;
    } catch (err) {
      console.error('[AuthEngine] Greška pri verifikaciji lozinke:', err);
      return false;
    }
  }
}
