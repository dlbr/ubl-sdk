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
    // OKLOP: Koristimo idFromName jer je klijentId u našem sistemu zapravo ime objekta (klijent_PIB)
    const doId = env.KLIJENT_BAZA_OBJECT.idFromName(klijentId);
    doStub = env.KLIJENT_BAZA_OBJECT.get(doId);
  } catch (idError: any) {
    throw createError({
      statusCode: 400,
      statusMessage: `Greška pri inicijalizaciji Durable Object-a: ${idError.message}`
    });
  }

  // 2. Poziv unutrašnjeg endpointa sa garantovanim rutingom kroz Router
  const internalUrl = 'http://durableobject/api/config/webhook-instructions';
  
  try {
    const response = await doStub.fetch(internalUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Nitro-Proxy': 'true'
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
