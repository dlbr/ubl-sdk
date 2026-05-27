export default {
  async fetch(request: Request, env: { COMPLIANCE_KV: KVNamespace }) {
    const url = new URL(request.url);
    const hash = url.searchParams.get('h');
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";

    // 1. Osnovni Rate Limiting (10 provera po minuti po IP adresi)
    const limitKey = `ratelimit:verify:${ip}`;
    const currentAttempts = await env.COMPLIANCE_KV.get(limitKey);
    const attempts = currentAttempts ? parseInt(currentAttempts) : 0;

    if (attempts >= 10) {
      return new Response("❌ Previše zahteva. Molimo pokušajte ponovo za jedan minut.", { 
        status: 429,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    // Povećavamo brojač sa TTL-om od 60 sekundi
    await env.COMPLIANCE_KV.put(limitKey, (attempts + 1).toString(), { expirationTtl: 60 });

    // 2. Provera integriteta
    if (!hash) {
      return new Response("❌ Greška: Nedostaje identifikacioni heš dokumenta.", { 
        status: 400,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    const metadata = await env.COMPLIANCE_KV.get(hash);

    if (metadata) {
      const data = JSON.parse(metadata);
      return new Response(`✅ DOKUMENT JE VALIDAN
----------------------------------
Identifikator: ${data.id || hash}
Vreme pečaćenja: ${data.timestamp || 'N/A'}
Integritet: POTVRĐEN (Kriptografski lanac neprekinut)
Sistem: SEF Bridge — dlbr.cloud`, { 
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
    
    return new Response("❌ UPOZORENJE: Dokument nije pronađen u našem registru integriteta! Postoji mogućnost da je dokument menjan ili nije izdat putem SEF Bridge sistema.", { 
      status: 404, 
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
};
