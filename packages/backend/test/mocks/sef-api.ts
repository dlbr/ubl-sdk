import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

export const sefServer = setupServer(
  http.post('https://demoefaktura.mfin.gov.rs/api/v1/faktura', async ({ request }) => {
    // Ovde možemo da proverimo validnost XML-a ako zatreba
    return HttpResponse.json({ 
      id: 'SEF-SIMULATED-ID-' + Math.random().toString(36).substring(7),
      status: 'Accepted'
    }, { status: 202 });
  })
);
