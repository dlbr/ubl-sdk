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
  ogImage: 'https://sef.dlbr.cloud/api/public/v1/kursna-lista/og.png',
  twitterCard: 'summary_large_image',
  twitterImage: 'https://sef.dlbr.cloud/api/public/v1/kursna-lista/og.png'
})

// JSON-LD za Google Rich Snippets
useHead({
  script: [
    {
      type: 'application/ld+json',
      children: computed(() => JSON.stringify(nbsPodaci.value?.schemaOrg || {}))
    }
  ]
})
</script>

<template>
  <div class="min-h-screen bg-slate-900 text-white font-sans">
    <KursnaListaMarquee v-if="nbsPodaci?.tiker" :tiker-podaci="nbsPodaci.tiker" />

    <main class="max-w-4xl mx-auto px-4 py-12">
      <header class="text-center mb-12">
        <h1 class="text-4xl font-extrabold tracking-tight text-white sm:text-5xl mb-4">
          Zvanična Kursna Lista NBS
        </h1>
        <p class="text-lg text-slate-400 max-w-xl mx-auto">
          Podaci osveženi na dan <span class="text-emerald-400 font-mono">{{ danasnjiDatum }}</span>, automatski sinhronizovani sa Narodnom bankom Srbije.
        </p>
      </header>

      <div v-if="error" class="bg-rose-950/50 border border-rose-800 text-rose-300 p-4 rounded-lg text-center font-medium">
        ⚠️ Trenutno nije moguće osvežiti podatke sa NBS servera. Koristimo poslednje stabilne podatke.
      </div>

      <div v-else-if="nbsPodaci" class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div v-for="valuta in nbsPodaci.tiker" :key="valuta.valuta" class="bg-slate-950 border border-slate-800 rounded-xl p-6 shadow-2xl hover:border-slate-700 transition-colors">
          <div class="flex justify-between items-start mb-4">
            <span class="bg-slate-900 text-slate-400 px-3 py-1 rounded-md text-sm font-mono border border-slate-800">
              {{ valuta.valuta }}
            </span>
            <span 
              :class="[
                'text-xs font-bold px-2 py-0.5 rounded',
                valuta.smer === 'GORE' ? 'bg-emerald-950 text-emerald-400' : 
                valuta.smer === 'DOLE' ? 'bg-rose-950 text-rose-400' : 
                'bg-slate-900 text-slate-500'
              ]"
            >
              {{ valuta.smer === 'GORE' ? 'RAST' : valuta.smer === 'DOLE' ? 'PAD' : 'STABILNO' }}
            </span>
          </div>
          
          <div class="text-3xl font-mono tabular-nums mb-2">
            {{ valuta.kurs.toFixed(4) }}
          </div>
          
          <div :class="['text-sm font-medium', valuta.smer === 'GORE' ? 'text-emerald-500' : valuta.smer === 'DOLE' ? 'text-rose-500' : 'text-slate-500']">
            {{ valuta.smer === 'GORE' ? '▲' : valuta.smer === 'DOLE' ? '▼' : '■' }}
            {{ valuta.promenaProcenat.toFixed(4) }}%
          </div>
        </div>
      </div>

      <!-- CTA Sekcija za B2B lidove -->
      <section class="bg-emerald-600 rounded-2xl p-8 text-center shadow-2xl">
        <h2 class="text-2xl font-bold text-white mb-4">Dosta vam je ručnog preračunavanja deviznih faktura?</h2>
        <p class="text-emerald-100 mb-6 text-lg">
          Naš sistem automatski povlači NBS kurs i generiše eFakture u 3 sekunde. Potpuna usklađenost sa SEF-om.
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
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
