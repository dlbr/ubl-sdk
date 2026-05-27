<script setup lang="ts">
const { data: nbsPodaci, error } = await useFetch('/api/public/kursna-lista')

const danasnjiDatum = nbsPodaci.value?.datum || new Date().toISOString().split('T')[0]
const eurKurs = computed(() => nbsPodaci.value?.tiker?.find((t: any) => t.valuta === 'EUR')?.kurs || 117.2)

useSeoMeta({
  title: `Srednji Kurs Evra NBS Danas (${danasnjiDatum}) | Kursna Lista za eFakture`,
  description: `Zvanični srednji kurs Narodne banke Srbije za danas je ${eurKurs.value} RSD. Besplatan JSON API za eFakture (SEF) i automatsko devizno računovodstvo.`,
  keywords: 'srednji kurs evra, nbs kursna lista, kurs evra danas, sef devizni kurs, efakture kurs nbs, clan 10 pdv prenos obaveze',
  ogTitle: `Srednji Kurs Evra NBS Danas | Automatska Kursna Lista`,
  ogDescription: `Sinhronizovani podaci direktno iz NBS servisa za eFakture i knjigovodstvo. Proverite trendove valuta.`,
  ogType: 'website',
  ogUrl: 'https://sef.dlbr.cloud/kursna-lista',
  ogImage: 'https://sef.dlbr.cloud/api/public/v1/kursna-lista/og.png',
  ogImageWidth: '1200',
  ogImageHeight: '630',
  ogImageAlt: 'Zvanični Srednji Kurs NBS — EUR, USD, CHF',
  twitterCard: 'summary_large_image',
  twitterTitle: `EUR = ${eurKurs.value} RSD | Kursna Lista NBS`,
  twitterDescription: `Zvanični srednji kurs NBS za danas (${danasnjiDatum}). Besplatan JSON API za eFakture.`,
  twitterImage: 'https://sef.dlbr.cloud/api/public/v1/kursna-lista/og.png',
})

// JSON-LD za Google Rich Snippets – statički objekt, ne zavisi od API odgovora
useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FinancialProduct',
        name: 'Zvanični Srednji Kurs NBS',
        description: 'Automatski sinhronizovani kursevi Narodne banke Srbije za eFakture.',
        url: 'https://sef.dlbr.cloud/kursna-lista',
        provider: { '@type': 'Organization', name: 'dlbr.cloud', url: 'https://sef.dlbr.cloud' }
      })
    }
  ]
})

const activeTab = ref<'curl' | 'js' | 'json' | 'historical'>('curl')
const historicalDate = ref(new Date().toISOString().split('T')[0])
const { data: historicalData, pending: historicalPending, refresh: fetchHistorical } = await useAsyncData(
  'historical-rate',
  () => {
    if (activeTab.value !== 'historical') return Promise.resolve(null)
    return $fetch('/api/public/kursna-lista/historical', {
      params: { date: historicalDate.value }
    })
  },
  { watch: [historicalDate] }
)

const snippets = computed(() => ({
  curl: `curl -s ${apiUrl}`,
  js: `fetch('${apiUrl}')
  .then(res => res.json())
  .then(data => console.log("EUR Srednji Kurs:", data.tiker.find(t => t.valuta === 'EUR').kurs));`,
  json: `{
  "status": "success",
  "datum": "${danasnjiDatum}",
  "tiker": [
    { "valuta": "EUR", "kurs": ${eurKurs.value.toFixed(4)}, "smer": "GORE", "promenaProcenat": 0.0000 },
    { "valuta": "USD", "kurs": 108.5000, "smer": "DOLE", "promenaProcenat": 0.0000 },
    { "valuta": "CHF", "kurs": 121.1000, "smer": "ISTO", "promenaProcenat": 0.0000 }
  ]
}`,
  historical: `// Pretraga za datum: ${historicalDate.value}`
}))

// ... (keep copy functions)

// UI updates inside the tabs div:
            <div class="flex border-b border-slate-800 gap-6 text-sm font-medium">
              <button 
                @click="activeTab = 'curl'"
                :class="['pb-3 transition-colors relative', activeTab === 'curl' ? 'text-emerald-400 border-b-2 border-emerald-500' : 'text-slate-500 hover:text-slate-300']"
              >
                cURL
              </button>
              <button 
                @click="activeTab = 'js'"
                :class="['pb-3 transition-colors relative', activeTab === 'js' ? 'text-emerald-400 border-b-2 border-emerald-500' : 'text-slate-500 hover:text-slate-300']"
              >
                JavaScript
              </button>
              <button 
                @click="activeTab = 'json'"
                :class="['pb-3 transition-colors relative', activeTab === 'json' ? 'text-emerald-400 border-b-2 border-emerald-500' : 'text-slate-500 hover:text-slate-300']"
              >
                JSON Odgovor
              </button>
              <button 
                @click="activeTab = 'historical'"
                :class="['pb-3 transition-colors relative', activeTab === 'historical' ? 'text-emerald-400 border-b-2 border-emerald-500' : 'text-slate-500 hover:text-slate-300']"
              >
                Arhiva & Pretraga
              </button>
            </div>

            <!-- Kod snippet ili Pretraga -->
            <div v-if="activeTab !== 'historical'" class="relative group">
              <pre class="bg-slate-900/80 border border-slate-800/60 rounded-xl p-5 font-mono text-xs md:text-sm text-slate-300 overflow-x-auto leading-relaxed max-h-[300px]"><code>{{ snippets[activeTab] }}</code></pre>
              
              <button 
                @click="copySnippet"
                class="absolute top-3 right-3 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-200 flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 text-xs font-semibold"
              >
                <span>{{ copiedCode ? '✓ Kopirano' : '📋 Kopiraj' }}</span>
              </button>
            </div>

            <div v-else class="space-y-4">
              <div class="flex items-center gap-4 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                <input 
                  type="date" 
                  v-model="historicalDate"
                  class="bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <p class="text-xs text-slate-500">Izaberite datum za koji želite da proverite zvaničnu kursnu listu.</p>
              </div>

              <div v-if="historicalPending" class="flex justify-center py-8">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
              </div>

              <div v-else-if="historicalData" class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div v-for="valuta in historicalData.tiker" :key="valuta.valuta" class="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                  <div class="text-xs text-slate-500 mb-1">{{ valuta.valuta }} (Srednji)</div>
                  <div class="text-xl font-mono text-emerald-400">{{ valuta.kurs.toFixed(4) }}</div>
                </div>
              </div>
            </div>
        </div>
      </div>

      <!-- CTA Sekcija za B2B lidove -->
      <section class="bg-emerald-600 rounded-2xl p-8 text-center shadow-2xl">
        <h2 class="text-2xl font-bold text-white mb-4">Dosta vam je ručnog preračunavanja deviznih faktura?</h2>
        <p class="text-emerald-100 mb-6 text-lg">
          Naš sistem automatski povlači NBS kurs i generiše eFakture u milisekundama (manje od 50ms). Potpuna usklađenost sa SEF-om.
        </p>
        <button class="bg-white text-emerald-700 font-bold py-3 px-8 rounded-full hover:bg-emerald-50 transition-colors shadow-lg">
          Isprobajte besplatno 14 dana
        </button>
      </section>

      <!-- FAQ za SEO -->
      <section class="mt-16 border-t border-slate-800 pt-12">
        <h3 class="text-2xl font-bold mb-8">Često postavljana pitanja</h3>
        <div class="space-y-6">
          <div>
            <h4 class="text-lg font-semibold text-emerald-400 mb-2">Po kom kursu se izdaje devizna eFaktura?</h4>
            <p class="text-slate-400">Prema zakonu, devizna eFaktura se izdaje po zvaničnom srednjem kursu Narodne banke Srbije na dan prometa ili dan izdavanja računa.</p>
          </div>
          <div>
            <h4 class="text-lg font-semibold text-emerald-400 mb-2">Da li nudite besplatan kursni API?</h4>
            <p class="text-slate-400">Da, naša platforma nudi javni JSON API za programere koji žele da integrišu zvanični NBS kurs u svoje aplikacije potpuno besplatno.</p>
            <div class="mt-3 bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 font-mono text-xs text-slate-300 space-y-2 max-w-xl">
              <span class="text-slate-500 block font-sans font-semibold text-[10px] uppercase tracking-wider">Primer integracije (JavaScript):</span>
              <pre class="overflow-x-auto text-emerald-400"><code>const res = await fetch('https://sef.dlbr.cloud/api/public/kursna-lista');
const { tiker } = await res.json();
console.log(tiker); // Vraća srednje kurseve za EUR, USD i CHF</code></pre>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
