<script setup lang="ts">
const { klijentId } = useSefAuth()
</script>

<template>
  <div class="min-h-screen bg-gray-50 font-sans text-gray-900 pb-20">
    <!-- Header -->
    <nav class="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
        <NuxtLink to="/" class="flex items-center gap-3">
          <div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-200">
            <span class="text-white font-black text-lg">S</span>
          </div>
          <span class="font-bold text-lg tracking-tight text-gray-900">SEF Bridge Docs</span>
        </NuxtLink>
        <NuxtLink v-if="klijentId" to="/dashboard" class="text-sm font-bold text-blue-600 hover:underline">
          Nazad na Dashboard
        </NuxtLink>
        <NuxtLink v-else to="/onboarding" class="text-sm font-bold text-blue-600 hover:underline">
          Aktivacija Naloga
        </NuxtLink>
      </div>
    </nav>

    <main class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div class="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden">
        <div class="p-8 md:p-12">
          <header class="mb-16">
            <div class="inline-flex items-center px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-widest border border-blue-100 mb-4">
              Tehnička Specifikacija v2.0
            </div>
            <h1 class="text-4xl font-black text-gray-900 mb-6 tracking-tight leading-tight">
              SEF Bridge v2 — Tehnička Specifikacija & API Dokumentacija
            </h1>
            <p class="text-lg text-gray-600 leading-relaxed max-w-3xl">
              Sistem je projektovan kao izolovani, multi-tenant Edge Ledger koji se izvršava na samoj ivici Cloudflare mreže (Edge), 
              obezbeđujući asinhronu komunikaciju sa Sistemom E-Faktura (SEF) i dvoetapnu validaciju za e-Porezi (POPDV/PPPDV).
            </p>
          </header>

          <div class="space-y-20">
            <!-- 1. Arhitektonski Pregled -->
            <section id="arhitektura">
              <h2 class="text-2xl font-black text-gray-900 mb-6 flex items-center gap-3">
                <span class="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center text-sm">1</span>
                Arhitektonski Pregled (Edge Topology)
              </h2>
              <p class="text-gray-600 mb-6 leading-relaxed">
                SEF Bridge v2 ne koristi deljenu, centralnu bazu podataka. Svaki klijent (Tenant) prilikom onboarding-a dobija sopstveni, hardverski i memorijski izolovani <strong>Cloudflare Durable Object</strong> koji u sebi nosi nativnu, izolovanu SQLite bazu podataka.
              </p>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                  <div class="text-blue-600 font-bold mb-2">Edge Latency</div>
                  <p class="text-xs text-gray-500 leading-relaxed">Lokalne kriptografske sesije i ruting se izvršavaju za <strong>&lt;1ms</strong> usled blizine klijentu.</p>
                </div>
                <div class="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                  <div class="text-blue-600 font-bold mb-2">Poreska Agregacija</div>
                  <p class="text-xs text-gray-500 leading-relaxed">Sumiranje 10.000 faktura traje <strong>&lt;47ms</strong> zahvaljujući in-memory SQLite JSON1 arhitekturi.</p>
                </div>
                <div class="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                  <div class="text-blue-600 font-bold mb-2">Mrežna Otpornost</div>
                  <p class="text-xs text-gray-500 leading-relaxed">Transient-Retry mehanizam automatski rešava 503 i 429 greške SEF-a bez prekida tvog ERP-a.</p>
                </div>
              </div>
            </section>

            <!-- 2. Autentifikacija -->
            <section id="auth">
              <h2 class="text-2xl font-black text-gray-900 mb-6 flex items-center gap-3">
                <span class="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center text-sm">2</span>
                Autentifikacija & Bezbednosni Oklop
              </h2>
              
              <div class="space-y-8">
                <div>
                  <h3 class="text-lg font-bold text-gray-900 mb-3">A. Klijentski Interfejs (Browser / Dashboard)</h3>
                  <p class="text-gray-600 mb-4 text-sm leading-relaxed">
                    Pristup kontrolnoj tabli je zaštićen <code>__Host-sef_bridge_session</code> HttpOnly kolačićem. 
                    Ovaj "Titanium" oklop koristi <strong>AES-256-GCM</strong> enkripciju i <strong>SameSite=Strict</strong> politiku, 
                    čime se u potpunosti eliminišu XSS i CSRF vektori napada.
                  </p>
                </div>

                <div>
                  <h3 class="text-lg font-bold text-gray-900 mb-3">B. ERP / Programski Pristup (API Integracija)</h3>
                  <p class="text-gray-600 mb-4 text-sm leading-relaxed">
                    Spoljni sistemi vrše autentifikaciju prosleđivanjem unikatnog tokena u svakom zahtevu:
                  </p>
                  <div class="bg-gray-900 rounded-2xl p-6 font-mono text-sm shadow-inner">
                    <div class="text-gray-500 mb-1"># HTTP Header</div>
                    <div class="text-blue-400">X-Klijent-ID: <span class="text-white">klijent_100000010</span></div>
                  </div>
                </div>
              </div>
            </section>

            <!-- 3. API Reference -->
            <section id="api">
              <h2 class="text-2xl font-black text-gray-900 mb-8 flex items-center gap-3">
                <span class="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center text-sm">3</span>
                API Reference (Proizvodni Endpointi)
              </h2>

              <div class="space-y-12">
                <!-- Onboarding -->
                <article class="group">
                  <div class="flex items-center gap-3 mb-4">
                    <span class="px-2 py-1 bg-green-100 text-green-700 text-[10px] font-black rounded uppercase">POST</span>
                    <h3 class="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition">/api/register</h3>
                  </div>
                  <p class="text-sm text-gray-500 mb-4">Inicijalizuje izolovani SQLite Ledger za novu firmu i postavlja inicijalne limite.</p>
                  <div class="bg-gray-900 rounded-2xl p-6 font-mono text-xs overflow-x-auto text-gray-300">
<pre>{
  "pib": "100000010",
  "naziv": "Kompanija d.o.o.",
  "sef_api_key": "sk_live_drzavni_api_kljuc"
}</pre>
                  </div>
                </article>

                <!-- Login -->
                <article class="group">
                  <div class="flex items-center gap-3 mb-4">
                    <span class="px-2 py-1 bg-green-100 text-green-700 text-[10px] font-black rounded uppercase">POST</span>
                    <h3 class="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition">/api/auth/login</h3>
                  </div>
                  <p class="text-sm text-gray-500 mb-4 italic">Self-Healing Key Rotation: Ako je ključ promenjen na SEF-u, sistem ga automatski proverava i ažurira Ledger u hodu.</p>
                  <div class="bg-gray-900 rounded-2xl p-6 font-mono text-xs overflow-x-auto text-gray-300">
<pre>{
  "pib": "100000010",
  "api_key": "sk_live_vazeci_kljuc",
  "operater": "Knjigovođa Nikola"
}</pre>
                  </div>
                </article>

                <!-- Batch Ingestion -->
                <article class="group">
                  <div class="flex items-center gap-3 mb-4">
                    <span class="px-2 py-1 bg-green-100 text-green-700 text-[10px] font-black rounded uppercase">POST</span>
                    <h3 class="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition">/api/fakture/batch</h3>
                  </div>
                  <p class="text-sm text-gray-500 mb-4">Asinhroni uvoz velikog broja dokumenata. Odmah vraća 202, a procesiranje se nastavlja u pozadini.</p>
                  <div class="bg-gray-900 rounded-2xl p-6 font-mono text-xs overflow-x-auto text-gray-300">
<pre>{
  "fakture": [
    { "ID": "INV-001", "broj_fakture": "2026/01", "iznos": 12000.00, ... },
    { "ID": "INV-002", "broj_fakture": "2026/02", "iznos": 5400.00, ... }
  ]
}</pre>
                  </div>
                </article>

                <!-- POPDV Summary -->
                <article class="group">
                  <div class="flex items-center gap-3 mb-4">
                    <span class="px-2 py-1 bg-blue-100 text-blue-700 text-[10px] font-black rounded uppercase">GET</span>
                    <h3 class="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition">/api/analytics/pppdv-summary</h3>
                  </div>
                  <p class="text-sm text-gray-500 mb-4">Generiše poreske pozicije za zadati period (format: YYYY-MM).</p>
                  <div class="bg-gray-900 rounded-2xl p-6 font-mono text-xs overflow-x-auto text-green-400">
<pre>{
  "success": true,
  "data": {
    "period": "2026-05",
    "pozicija001_osnovica20": 500000.00,
    "pozicija101_pdv20": 100000.00,
    "porezZaUplatuIliPovracaj": 55000.00
  }
}</pre>
                  </div>
                </article>
              </div>
            </section>

            <!-- 4. Državni Webhook-ovi -->
            <section id="webhooks">
              <h2 class="text-2xl font-black text-gray-900 mb-6 flex items-center gap-3">
                <span class="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center text-sm">4</span>
                Državni Webhook-ovi (Push Pipeline)
              </h2>
              <p class="text-gray-600 mb-6 leading-relaxed text-sm">
                Za praćenje izmena statusa u realnom vremenu, podesite sledeće URL-ove na svom klijentskom nalogu na zvaničnom SEF portalu:
              </p>
              <div class="space-y-4">
                <div class="bg-orange-50 border border-orange-100 p-6 rounded-2xl">
                  <div class="text-[10px] font-black text-orange-500 uppercase tracking-widest mb-1">URL za izlazne fakture (Sales)</div>
                  <code class="text-sm break-all font-bold text-orange-900">https://sef.dlbr.cloud/api/webhooks/sef?smer=SALES</code>
                </div>
                <div class="bg-orange-50 border border-orange-100 p-6 rounded-2xl">
                  <div class="text-[10px] font-black text-orange-500 uppercase tracking-widest mb-1">URL za ulazne fakture (Purchases)</div>
                  <code class="text-sm break-all font-bold text-orange-900">https://sef.dlbr.cloud/api/webhooks/sef?smer=PURCHASES</code>
                </div>
              </div>
            </section>
          </div>

          <footer class="mt-20 pt-12 border-t border-gray-100 text-center">
            <div class="flex justify-center gap-4 mb-6">
              <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span class="text-[10px] font-black uppercase tracking-widest text-gray-400">Sistem je Operativan na Cloudflare Edge</span>
            </div>
            <p class="text-gray-400 text-xs font-medium">
              SEF Bridge v2.0 &bull; Razvijeno za inženjere &bull; Sva prava zadržana 2026.
            </p>
          </footer>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=JetBrains+Mono:wght@500&display=swap');
.font-sans { font-family: 'Inter', sans-serif; }
.font-mono { font-family: 'JetBrains Mono', monospace; }

code {
  @apply bg-gray-100 text-blue-600 px-1.5 py-0.5 rounded font-mono text-[13px] font-bold;
}

pre {
  @apply leading-relaxed;
}

section {
  @apply scroll-mt-24;
}
</style>
