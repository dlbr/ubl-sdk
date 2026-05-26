import { defineEventHandler, getHeader, getRequestHost } from 'h3';

/**
 * GET /api/webhook-setup
 * Vraća webhook URL-ove za konfiguraciju na državnom SEF portalu.
 * Javna ruta — klijentId se čita iz headera ili sesije.
 */
export default defineEventHandler(async (event) => {
  const klijentId = 
    getHeader(event, 'x-klijent-id') || 
    event.context.session?.klijentId || 
    '';

  // Backend Worker je dostupan na production domenu
  const env = event.context.cloudflare?.env;
  const backendUrl = env?.SEF_API_URL || 'https://sef.dlbr.cloud';

  return {
    success: true,
    data: {
      koraci: [
        'Prijavite se na portal eSEF (efaktura.mfin.gov.rs)',
        'Idite na: Podešavanja → Notifikacije → Webhook konfiguracija',
        'Unesite URL za izlazne fakture u polje "Sales webhook"',
        'Unesite URL za ulazne fakture u polje "Purchase webhook"',
        'Kliknite "Sačuvaj" — notifikacije će početi stizati odmah',
      ],
      fields: {
        sales_url: klijentId 
          ? `${backendUrl}/api/webhooks/sef-update` 
          : '',
        purchase_url: klijentId 
          ? `${backendUrl}/api/webhooks/sef-update`
          : '',
      },
    },
  };
});
