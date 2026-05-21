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
              Dokumentacija v3.5.0
            </div>
            <h1 class="text-4xl font-black text-gray-900 mb-6 tracking-tight leading-tight">
              ERP B2B Integracioni Modul — "XML-as-a-Service"
            </h1>
            <p class="text-lg text-gray-600 leading-relaxed max-w-3xl">
              Sistem usklađen sa Zakonom o e-fakturisaju: automatsko generisanje UBL 2.1 XML-a, 
              poštovanje zakonskih rokova do <strong>10. u mesecu</strong> i JSON podrška za EEO/EPP evidencije.
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
                Sistem automatski ubacuje obavezan <code>&lt;cbc:TaxExemptionReason&gt;</code> tekst na osnovu prosleđene šifre oslobođenja.
              </p>
            </section>

            <!-- 2. Poreski Oklop & Rokovi -->
            <section id="legal-hardening">
              <h2 class="text-2xl font-black text-gray-900 mb-8 flex items-center gap-3 text-blue-600">
                <span class="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center text-sm">2</span>
                Poreski Oklop & Rokovi (Zakon o EFI)
              </h2>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="border border-red-200 p-6 rounded-2xl bg-red-50 group">
                  <div class="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center mb-4 text-xl">🛡️</div>
                  <h3 class="font-bold text-red-900 mb-2">Grace Period (Do 10. u mesecu)</h3>
                  <p class="text-xs text-red-700 leading-relaxed font-medium">
                    Čak i ako je klijent blokiran, sistem <strong>do 10. u mesecu</strong> (zakonski rok) dozvoljava slanje faktura iz prethodnog meseca. Time osiguravamo poštovanje Člana 11. zakona bez kazni.
                  </p>
                </div>
                <div class="border border-green-200 p-6 rounded-2xl bg-green-50 group">
                  <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-4 text-xl">📊</div>
                  <h3 class="font-bold text-green-900 mb-2">Otkazivanje (Storno)</h3>
                  <p class="text-xs text-green-700 leading-relaxed font-medium">
                    Anuliranje fakture vrši se isključivo putem <code>Cancel</code> komande nad postojećim ID-jem (za neotvorene račune) ili izdavanjem Dokumenta o smanjenju (Tip 381).
                  </p>
                </div>
              </div>
            </section>

            <!-- 3. Open Source Inicijativa -->
            <section id="open-source" class="bg-gradient-to-br from-gray-900 to-blue-900 rounded-3xl p-8 md:p-12 text-white shadow-2xl overflow-hidden relative group">
              <div class="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                <svg class="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.44-1.304.759-1.607-2.665-.304-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.841 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              </div>
              <div class="relative z-10">
                <h2 class="text-3xl font-black mb-6 uppercase tracking-tight">Verujemo u Open Source</h2>
                <p class="text-blue-100 text-lg mb-8 leading-relaxed max-w-2xl">
                  Srž našeg sistema — <strong>Matrix UBL Builder</strong> — je potpuno otvoren i besplatan alat. 
                  Sada podržava i generisanje JSON payload-a za zvanične poreske evidencije (v3.4.0).
                </p>
                <div class="flex flex-col sm:flex-row gap-4">
                  <a href="https://github.com/dlbr/sef-ubl-builder" target="_blank" class="inline-flex items-center justify-center px-6 py-3 bg-white text-blue-900 font-black rounded-xl hover:bg-blue-50 transition shadow-xl uppercase text-xs tracking-widest gap-2">
                    <span>GitHub Repozitorijum</span>
                    <span class="text-base">➔</span>
                  </a>
                </div>
              </div>
            </section>

            <!-- 4. API Reference -->
            <section id="api-reference">
              <h2 class="text-2xl font-black text-gray-900 mb-8 flex items-center gap-3 text-blue-600">
                <span class="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center text-sm">3</span>
                API Referenca
              </h2>

              <div class="space-y-12">
                <article class="group">
                  <div class="flex items-center gap-3 mb-4">
                    <span class="px-2 py-1 bg-green-100 text-green-700 text-[10px] font-black rounded uppercase">POST</span>
                    <h3 class="text-xl font-bold text-gray-900">/api/evidencija/eeo</h3>
                  </div>
                  <p class="text-sm text-gray-500 mb-4 font-medium">Zbirna evidencija obračuna (JSON).</p>
                </article>

                <article class="group">
                  <div class="flex items-center gap-3 mb-4">
                    <span class="px-2 py-1 bg-blue-100 text-blue-700 text-[10px] font-black rounded uppercase">POST</span>
                    <h3 class="text-xl font-bold text-gray-900">/api/evidencija/epp</h3>
                  </div>
                  <p class="text-sm text-gray-500 mb-4 font-medium">Evidencija prethodnog poreza (JSON).</p>
                </article>
              </div>
            </section>
          </div>

          <footer class="mt-20 pt-12 border-t border-gray-100 text-center">
            <div class="flex justify-center gap-4 mb-6">
              <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span class="text-[10px] font-black uppercase tracking-widest text-gray-400">Sistem je Operativan na Cloudflare Edge</span>
            </div>
            <p class="text-gray-400 text-xs font-medium uppercase tracking-tighter">
              SEF Bridge v3.4.0 &bull; Razvijeno za ERP inženjere &bull; Sva prava zadržana 2026.
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
