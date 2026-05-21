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
          <span class="font-bold text-lg tracking-tight text-gray-900">SEF Bridge API</span>
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
              Dokumentacija v2.8
            </div>
            <h1 class="text-4xl font-black text-gray-900 mb-6 tracking-tight leading-tight">
              ERP B2B Integracioni Modul — "XML-as-a-Service"
            </h1>
            <p class="text-lg text-gray-600 leading-relaxed max-w-3xl">
              Sistem projektovan za srpsko tržište: automatsko generisanje UBL 2.1 XML-a, 
              poštovanje zakonskih rokova do 10. u mesecu i direktan izvoz za e-Porezi.
            </p>
          </header>

          <div class="space-y-20">
            <!-- 1. JSON-to-UBL Engine -->
            <section id="integration-pitch">
              <h2 class="text-2xl font-black text-gray-900 mb-6 flex items-center gap-3 text-blue-600">
                <span class="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center text-sm">1</span>
                JSON ➔ UBL 2.1 Mašina
              </h2>
              <p class="text-gray-600 mb-6 leading-relaxed">
                Vaš ERP šalje JSON, a naš sistem ga trenutno mapira u zakonski validan UBL 2.1 format. 
                <strong>Novo:</strong> Za fakture sa oslobođenjem od PDV-a, sistem automatski ubacuje obavezan <code>&lt;cbc:TaxExemptionReason&gt;</code> tekst na osnovu prosleđene šifre oslobođenja.
              </p>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-8 items-center bg-gray-900 rounded-3xl p-8 overflow-hidden shadow-2xl">
                <div>
                  <div class="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-4">ERP šalje: JSON</div>
                  <pre class="text-[11px] text-blue-100 leading-relaxed overflow-x-auto">
{
  "ID": "F-2026-001",
  "Lines": [{
    "ItemName": "Artikal",
    "VatCategory": "E",
    "ReasonCode": "PDV-RS-24-1-1"
  }]
}</pre>
                </div>
                <div class="relative">
                  <div class="absolute -left-4 top-1/2 -translate-y-1/2 text-blue-500 font-black hidden md:block">➔</div>
                  <div class="text-[10px] font-black text-green-400 uppercase tracking-widest mb-4">Sistem generiše: UBL + Reason</div>
                  <pre class="text-[10px] text-green-100 leading-tight opacity-60 overflow-x-auto">
&lt;cac:TaxCategory&gt;
  &lt;cbc:ID&gt;E&lt;/cbc:ID&gt;
  &lt;cbc:TaxExemptionReasonCode&gt;PDV-RS-24-1-1&lt;/cbc:TaxExemptionReasonCode&gt;
  &lt;cbc:TaxExemptionReason&gt;Oslobođeno...&lt;/cbc:TaxExemptionReason&gt;
&lt;/cac:TaxCategory&gt;</pre>
                </div>
              </div>
            </section>

            <!-- 2. Poreski Oklop & Rokovi -->
            <section id="legal-hardening">
              <h2 class="text-2xl font-black text-gray-900 mb-8 flex items-center gap-3 text-blue-600">
                <span class="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center text-sm">2</span>
                Poreski Oklop & Rokovi
              </h2>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="border border-red-200 p-6 rounded-2xl bg-red-50 group">
                  <div class="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center mb-4 text-xl">🛡️</div>
                  <h3 class="font-bold text-red-900 mb-2">Grace Period (Do 10. u mesecu)</h3>
                  <p class="text-xs text-red-700 leading-relaxed font-medium">
                    Čak i ako je klijent blokiran zbog neplaćanja, sistem <strong>do 10. u mesecu</strong> dozvoljava slanje faktura čiji je datum prometa iz prethodnog meseca. Time osiguravamo da Vaši klijenti uvek ispoštuju zakonski rok za SEF bez kazni.
                  </p>
                </div>
                <div class="border border-green-200 p-6 rounded-2xl bg-green-50 group">
                  <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-4 text-xl">📥</div>
                  <h3 class="font-bold text-green-900 mb-2">TXT Izvoz za e-Poreze</h3>
                  <p class="text-xs text-green-700 leading-relaxed font-medium">
                    Krajnji klijenti mogu direktno preuzeti <code>.txt</code> fajl spreman za uvoz na portal <strong>e-Porezi</strong>. Nema ručnog prepisivanja PPPDV polja.
                  </p>
                </div>
              </div>
            </section>

            <!-- 3. API Reference -->
            <section id="api-reference">
              <h2 class="text-2xl font-black text-gray-900 mb-8 flex items-center gap-3 text-blue-600">
                <span class="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center text-sm">3</span>
                API Referenca
              </h2>

              <div class="space-y-12">
                <article class="group">
                  <div class="flex items-center gap-3 mb-4">
                    <span class="px-2 py-1 bg-green-100 text-green-700 text-[10px] font-black rounded uppercase">POST</span>
                    <h3 class="text-xl font-bold text-gray-900">/api/fakture/send</h3>
                  </div>
                  <p class="text-sm text-gray-500 mb-6 font-medium">Prima JSON podatke fakture. Podržava 380, 381, 383, 386 tipove dokumenata.</p>
                </article>

                <article class="group">
                  <div class="flex items-center gap-3 mb-4">
                    <span class="px-2 py-1 bg-amber-100 text-amber-700 text-[10px] font-black rounded uppercase">GET</span>
                    <h3 class="text-xl font-bold text-gray-900">/api/analytics/pppdv-export</h3>
                  </div>
                  <p class="text-sm text-gray-500 mb-4 font-medium">Vraća tekstualni fajl u zvaničnom formatu Poreske uprave Srbije (Pipe-delimited).</p>
                  <div class="bg-gray-100 rounded-xl p-4 font-mono text-[10px] text-gray-600">
                    GET /api/analytics/pppdv-export?period=2026-05
                  </div>
                </article>
              </div>
            </section>

            <!-- 4. Webhook Idempotency -->
            <section id="webhooks">
              <h2 class="text-2xl font-black text-gray-900 mb-6 flex items-center gap-3 text-blue-600">
                <span class="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center text-sm">4</span>
                Mrežna Otpornost (Webhooks)
              </h2>
              <p class="text-gray-600 mb-6 leading-relaxed text-sm">
                Naš Webhook prijemnik ima ugrađen <strong>Idempotency Oklop</strong>. Svaki <code>faktura_id</code> se prati u bazi, čime sprečavamo dupliranje produžetaka licence usled državnih mrežnih zagušenja i višestrukih pokušaja SEF-a.
              </p>
              <code class="block p-4 bg-orange-50 border border-orange-100 rounded-2xl text-orange-900 text-xs font-bold break-all">
                URL: https://sef.dlbr.cloud/api/webhooks/sef?smer=SALES
              </code>
            </section>
          </div>

          <footer class="mt-20 pt-12 border-t border-gray-100 text-center">
            <div class="flex justify-center gap-4 mb-6">
              <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span class="text-[10px] font-black uppercase tracking-widest text-gray-400">Sistem je Operativan na Cloudflare Edge</span>
            </div>
            <p class="text-gray-400 text-xs font-medium uppercase tracking-tighter">
              SEF Bridge v2.8 &bull; Razvijeno za ERP inženjere &bull; Sva prava zadržana 2026.
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
