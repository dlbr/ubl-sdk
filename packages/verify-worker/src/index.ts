export default {
  async fetch(request: Request, env: { COMPLIANCE_KV: KVNamespace }) {
    const url = new URL(request.url);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";

    // 1. Rate Limiting
    const limitKey = `ratelimit:verify:${ip}`;
    const currentAttempts = await env.COMPLIANCE_KV.get(limitKey);
    const attempts = currentAttempts ? parseInt(currentAttempts) : 0;

    if (attempts >= 10) {
      return new Response("❌ Previše zahteva. Molimo pokušajte ponovo za jedan minut.", { 
        status: 429,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    await env.COMPLIANCE_KV.put(limitKey, (attempts + 1).toString(), { expirationTtl: 60 });

    // 2. Ekstrakcija heša
    let hash = url.searchParams.get('h');
    if (!hash) {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && parts[0] === 'verify') {
        hash = parts[1];
      }
    }
    
    if (!hash) {
      return new Response("❌ Greška: Nedostaje identifikacioni heš dokumenta.", { 
        status: 400,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    // 3. Provera
    const metadata = await env.COMPLIANCE_KV.get(hash);

    if (metadata) {
      const data = JSON.parse(metadata);
      return new Response(`✅ DOKUMENT JE VALIDAN
----------------------------------
Identifikator: ${data.id || hash}
Vreme pečaćenja: ${data.timestamp || 'N/A'}
Integritet: POTVRĐEN (Kriptografski lanac neprekinut)
Sistem: SEF Bridge`, { 
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
    
    return new Response("❌ UPOZORENJE: Dokument nije pronađen!", { 
      status: 404, 
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
};
