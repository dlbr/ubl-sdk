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
              Dokumentacija v2.0
            </div>
            <h1 class="text-4xl font-black text-gray-900 mb-6 tracking-tight leading-tight">
              ERP B2B Integracioni Modul — "XML-as-a-Service"
            </h1>
            <p class="text-lg text-gray-600 leading-relaxed max-w-3xl">
              Prestanite da gubite vreme na ručno sklapanje komplikovanih UBL 2.1 struktura i praćenje stalnih promena državnih validacija. 
              <strong>SEF Bridge v2</strong> prima čist JSON, a za Vas generiše, potpisuje i isporučuje forenzički precizan XML na SEF.
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
                Vaš ERP šalje podatke u formatu koji razumete (JSON), a naš sistem na ivici mreže ih trenutno mapira u zakonski validan UBL 2.1 format. Mi brinemo o imenskim prostorima (namespaces), <code>SrbDtExt</code> ekstenzijama i preciznim poreskim blokovima.
              </p>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-8 items-center bg-gray-900 rounded-3xl p-8 overflow-hidden shadow-2xl">
                <div>
                  <div class="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-4">Vaš ERP šalje: JSON</div>
                  <pre class="text-[11px] text-blue-100 leading-relaxed overflow-x-auto">
{
  "ID": "F-2026-001",
  "InvoiceTypeCode": "380",
  "Lines": [{
    "ItemName": "Softverska Licenca",
    "Quantity": 1,
    "Price": 1500,
    "VatPercent": 20
  }]
}</pre>
                </div>
                <div class="relative">
                  <div class="absolute -left-4 top-1/2 -translate-y-1/2 text-blue-500 font-black hidden md:block">➔</div>
                  <div class="text-[10px] font-black text-green-400 uppercase tracking-widest mb-4">Sistem generiše: UBL 2.1 XML</div>
                  <pre class="text-[10px] text-green-100 leading-tight opacity-60 overflow-x-auto">
&lt;Invoice xmlns="..."&gt;
  &lt;cbc:ID&gt;F-2026-001&lt;/cbc:ID&gt;
  &lt;cbc:InvoiceTypeCode&gt;380&lt;/cbc:InvoiceTypeCode&gt;
  &lt;cac:TaxTotal&gt;
    &lt;cbc:TaxAmount currencyID="RSD"&gt;300.00&lt;/cbc:TaxAmount&gt;
    &lt;!-- Forenzički tačni poreski blokovi --&gt;
  &lt;/cac:TaxTotal&gt;
&lt;/Invoice&gt;</pre>
                </div>
              </div>
            </section>

            <!-- 2. Rešeni "Pakleni" Scenariji -->
            <section id="scenarios">
              <h2 class="text-2xl font-black text-gray-900 mb-8 flex items-center gap-3 text-blue-600">
                <span class="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center text-sm">2</span>
                Rešeni "Pakleni" Scenariji
              </h2>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="border border-gray-200 p-6 rounded-2xl hover:border-blue-300 transition group bg-white shadow-sm">
                  <div class="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-amber-100 transition text-xl">💰</div>
                  <h3 class="font-bold text-gray-900 mb-2">Avansi i Konačni Računi</h3>
                  <p class="text-xs text-gray-500 leading-relaxed font-medium">Automatsko sravnjivanje <code>PrepaidAmount</code> i <code>BillingReference</code> tagova. Vi samo kažete "ovo zatvara onaj avans", Bridge radi kompletnu matematiku.</p>
                </div>
                <div class="border border-gray-200 p-6 rounded-2xl hover:border-blue-300 transition group bg-white shadow-sm">
                  <div class="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-100 transition text-xl">🏛️</div>
                  <h3 class="font-bold text-gray-900 mb-2">Javne Nabavke (CRF/JBKJS)</h3>
                  <p class="text-xs text-gray-500 leading-relaxed font-medium">Potpuna integracija sa Centralnim Registrom Faktura. Ispravno ubrizgavanje <code>BuyerReference</code> i JBKJS brojeva budžetskih korisnika bez ijedne greške.</p>
                </div>
                <div class="border border-gray-200 p-6 rounded-2xl hover:border-blue-300 transition group bg-white shadow-sm">
                  <div class="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-green-100 transition text-xl">🛡️</div>
                  <h3 class="font-bold text-gray-900 mb-2">Poreska Oslobođenja</h3>
                  <p class="text-xs text-gray-500 leading-relaxed font-medium">Ugrađena mapa svih važećih <code>ReasonCode</code> šifara (član 24, član 10, izvoz). SEF nikada neće odbiti Vaš dokument zbog loše šifre oslobođenja.</p>
                </div>
                <div class="border border-gray-200 p-6 rounded-2xl hover:border-blue-300 transition group bg-white shadow-sm">
                  <div class="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-red-100 transition text-xl">📦</div>
                  <h3 class="font-bold text-gray-900 mb-2">Prilozi (Attachments)</h3>
                  <p class="text-xs text-gray-500 leading-relaxed font-medium">Šaljite binarne PDF-ove u JSON-u, mi ih Base64 enkodiramo i smeštamo u <code>AdditionalDocumentReference</code> blok do zakonskih 25MB.</p>
                </div>
              </div>
            </section>

            <!-- 3. Brzina i Autentifikacija -->
            <section id="auth-speed">
              <h2 class="text-2xl font-black text-gray-900 mb-8 flex items-center gap-3 text-blue-600">
                <span class="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center text-sm">3</span>
                Brzina i Autentifikacija
              </h2>
              <div class="bg-blue-50 border border-blue-100 rounded-3xl p-8">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <div>
                    <h3 class="font-black text-blue-900 uppercase text-sm tracking-widest mb-4">Edge Latency</h3>
                    <p class="text-sm text-blue-800 leading-relaxed">
                      Sistem se izvršava na samoj ivici Cloudflare mreže. Vreme odziva za validaciju i generisanje XML-a je obično <strong>manje od 50ms</strong>, što je neuporedivo brže od bilo kog centralizovanog rešenja.
                    </p>
                  </div>
                  <div>
                    <h3 class="font-black text-blue-900 uppercase text-sm tracking-widest mb-4">Programski Pristup</h3>
                    <p class="text-sm text-blue-800 leading-relaxed">
                      Svaki zahtev autorizujte putem unikatnog ID-ja Vašeg tenanta koji dobijate na dashboard-u:
                    </p>
                    <code class="block mt-4 p-3 bg-white rounded-xl border border-blue-200 text-blue-600 font-mono text-xs">
                      X-Klijent-ID: klijent_123456789
                    </code>
                  </div>
                </div>
              </div>
            </section>

            <!-- 4. API Reference -->
            <section id="api-reference">
              <h2 class="text-2xl font-black text-gray-900 mb-8 flex items-center gap-3 text-blue-600">
                <span class="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center text-sm">4</span>
                API Referenca
              </h2>

              <div class="space-y-12">
                <article class="group">
                  <div class="flex items-center gap-3 mb-4">
                    <span class="px-2 py-1 bg-green-100 text-green-700 text-[10px] font-black rounded uppercase">POST</span>
                    <h3 class="text-xl font-bold text-gray-900">/api/fakture/send</h3>
                  </div>
                  <p class="text-sm text-gray-500 mb-6 font-medium">Prima JSON podatke fakture, validira ih, prevodi u UBL 2.1 i asinhrono isporučuje na SEF.</p>
                  <div class="bg-gray-900 rounded-2xl p-6 font-mono text-xs overflow-x-auto text-gray-300">
<pre>{
  "ID": "INV-2026-101",
  "InvoiceTypeCode": "380",
  "IssueDate": "2026-05-21",
  "Lines": [
    {
      "ItemName": "Artikal 1",
      "Quantity": 1,
      "Price": 1000.00,
      "VatPercent": 20
    }
  ],
  "LegalMonetaryTotal": {
    "PayableAmount": 1200.00
  }
}</pre>
                  </div>
                </article>

                <article class="group">
                  <div class="flex items-center gap-3 mb-4">
                    <span class="px-2 py-1 bg-blue-100 text-blue-700 text-[10px] font-black rounded uppercase">POST</span>
                    <h3 class="text-xl font-bold text-gray-900">/api/fakture/batch</h3>
                  </div>
                  <p class="text-sm text-gray-500 mb-4 font-medium">Masovni uvoz dokumenata. Preporučeno za noćne sinhronizacije i velike ERP sisteme.</p>
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
              SEF Bridge v2.0 &bull; Razvijeno za ERP inženjere &bull; Sva prava zadržana 2026.
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
