// /server/api/webhook-setup.get.ts

import { defineEventHandler, getHeader } from 'h3';

export default defineEventHandler(async (event) => {
  // 1. Striktna ekstrakcija identiteta klijenta
  const klijentId = getHeader(event, 'X-Klijent-ID');
  
  if (!klijentId) {
    throw createError({ 
      statusCode: 401, 
      statusMessage: 'Neautorizovan pristup - Nedostaje X-Klijent-ID' 
    });
  }

  // Pristupamo Cloudflare okruženju preko Nitro konteksta
  const env = event.context.cloudflare.env;
  
  let doStub;
  try {
    // Defanzivno parsiranje: Pretpostavljamo da koristimo stroge 64-karakterne DO heš stringove (idFromString)
    // Ako tvoj sistem koristi proizvoljna tekstualna imena, vrati na idFromName(klijentId)
    const doId = env.KLIJENT_BAZA.idFromString(klijentId);
    doStub = env.KLIJENT_BAZA.get(doId);
  } catch (idError) {
    throw createError({
      statusCode: 400,
      statusMessage: `Malformisan X-Klijent-ID format: ${klijentId}`
    });
  }

  // 2. Poziv unutrašnjeg endpointa sa garantovanim rutingom kroz Pico ruter
  // Koristimo fiksni interni domen 'http://durableobject' kako bismo osigurali čistu izolaciju
  const internalUrl = 'http://durableobject/api/config/webhook-instructions';
  
  try {
    const response = await doStub.fetch(internalUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Nitro-Proxy': 'true' // Forenzički trag za unutrašnji DO log ako zatreba debug
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw createError({ 
        statusCode: response.status, 
        statusMessage: `Greška unutrašnjeg Ledger-a: ${errorText}` 
      });
    }

    return await response.json();
    
  } catch (meshError: any) {
    // Hvatanje mrežnih prekida unutar same Cloudflare mesh mreže
    throw createError({
      statusCode: 502,
      statusMessage: `Gatway Timeout / DO Mesh Unreachable: ${meshError.message}`
    });
  }
});
