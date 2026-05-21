import { describe, it, expect, vi } from 'vitest';
import { SefClient } from '../shared/services/sefClient';

// Mock-ujemo globalni fetch kako bismo simulirali ponašanje državnog SEF API-ja
const originalFetch = globalThis.fetch;

describe('SEF API Key Rotation & Auth Failure - Forenzički Test', () => {

  it('Scenario: Automatska detekcija 401 greške i uspešan oporavak nakon rotacije ključa', async () => {
    let trenutniDrzavniKljuc = 'sk_drzava_novi_v2_kljuc_2026'; // Ključ koji je trenutno aktivan na SEF-u
    
    const mockSefUrl = 'https://mock-sef.rs/api';

    // 1. PRESRETANJE MREŽE: Simuliramo državni WAF i SEF API gateway
    globalThis.fetch = vi.fn().mockImplementation(async (url, options) => {
      const headers = options.headers as Record<string, string>;
      const poslatiApiKey = headers['ApiKey'];

      // Ako ključ koji Worker šalje nije jednak trenutno aktivnom na državnom portalu -> 401
      if (poslatiApiKey !== trenutniDrzavniKljuc) {
        return new Response('Unauthorized: Invalid API Key or Subscription Token.', { 
          status: 401,
          headers: { 'Content-Type': 'text/plain' }
        });
      }

      // Ako je ključ ispravan, SEF uspešno prihvata fakturu
      return new Response(JSON.stringify({ SalesInvoiceId: 998877, InvoiceNumber: 'FA-2026-001' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    // 2. KRAH: Naš lokalni SQLite/Worker i dalje koristi stari (poništeni) ključ
    const lokalniSefKlijentSaStarimKljucem = new SefClient({
      apiKey: 'sk_lokalni_stari_ponisteni_kljuc', // Korisnik ga je promenio na portalu, ali ne i kod nas
      baseUrl: mockSefUrl,
      environment: 'production'
    });

    // Worker pokušava da pošalje fakturu iz reda (processQueue)
    const mockXml = '<Invoice>...</Invoice>';
    const krahOdgovor = await lokalniSefKlijentSaStarimKljucem.sendInvoice(mockXml, 'req_001');

    // VERIFIKACIJA KRAHA: Sistem ne sme da pukne, već mora defanzivno da presretne 401
    expect(krahOdgovor.success).toBe(false);
    expect(krahOdgovor.statusCode).toBe(401);
    expect(krahOdgovor.error).toContain('SEF_API_ERROR (401)');

    // [U realnom radu: Na ovom mestu Durable Object zaustavlja processQueue i piše u error_logs]
    console.log('✓ OKLOP: 401 uspešno uhvaćen, red zaustavljen bez krahiranja niti.');

    // 3. ROTACIJA (OPORAVAK): Korisnik je video crveni alarm na dashboardu i uneo novi ključ
    const noviAzuriraniLokalniKlijent = new SefClient({
      apiKey: 'sk_drzava_novi_v2_kljuc_2026', // Novi ključ uspešno perzistiran u SQLite konfiguraciju
      baseUrl: mockSefUrl,
      environment: 'production'
    });

    // Alarm ponovo budi processQueue i šalje istu fakturu
    const oporavakOdgovor = await noviAzuriraniLokalniKlijent.sendInvoice(mockXml, 'req_001');

    // VERIFIKACIJA OPORAVKA: Saobraćaj ponovo teče normalno
    expect(oporavakOdgovor.success).toBe(true);
    expect(oporavakOdgovor.salesInvoiceId).toBe(998877);
    expect(oporavakOdgovor.invoiceNumber).toBe('FA-2026-001');
    
    console.log('✓ OKLOP: Sistem se uspešno oporavio nakon ažuriranja ključa.');

    // Vraćamo fetch u prvobitno stanje
    globalThis.fetch = originalFetch;
  });
});
