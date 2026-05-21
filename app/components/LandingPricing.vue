<script setup lang="ts">
const isYearly = ref(false)

const plans = [
  {
    name: 'Micro',
    subtitle: 'Mali preduzetnici',
    monthly: '1.500',
    yearly: '15.000', // Prema tvom primeru "2 meseca gratis"
    actualYearly: '16.200', // Prema tvom finansijskom obračunu 10%
    features: [
      'Do 50 faktura / mesečno',
      'Edge-Native brzina',
      'Standardni Durable Object',
      'FTS5 pretraga firmi'
    ],
    cta: 'Započni Besplatno',
    popular: false
  },
  {
    name: 'Plus',
    subtitle: 'Srednje firme',
    monthly: '5.000',
    yearly: '50.000',
    actualYearly: '54.000',
    features: [
      'Do 500 faktura / mesečno',
      'Kumulativni godišnji limit',
      'Brzi sync (15 min)',
      'Prioritetna podrška'
    ],
    cta: 'Aktiviraj Plus',
    popular: true
  },
  {
    name: 'Agency',
    subtitle: 'Knjigovođe i Biroi',
    monthly: '15.000',
    yearly: '150.000',
    actualYearly: '162.000',
    features: [
      'Do 5.000 faktura / mesečno',
      'Multi-tenant panel',
      'Svi klijenti na jednom mestu',
      'Automatska POPDV analitika'
    ],
    cta: 'Aktiviraj Agency',
    popular: false
  }
]
</script>

<template>
  <section id="pricing" class="py-32 bg-white">
    <div class="max-w-7xl mx-auto px-6">
      <div class="text-center space-y-4 mb-16">
        <h2 class="text-4xl md:text-5xl font-black tracking-tight text-gray-900 uppercase">Transparentan Cenovnik</h2>
        <p class="text-xl text-gray-500 font-medium">Izaberite paket koji odgovara vašem obimu poslovanja.</p>

        <!-- Toggle Switch -->
        <div class="flex items-center justify-center gap-4 pt-8">
          <span :class="!isYearly ? 'text-gray-900 font-bold' : 'text-gray-400'" class="text-sm uppercase tracking-widest transition-colors">Mesečno</span>
          <button 
            @click="isYearly = !isYearly"
            class="w-16 h-8 bg-gray-100 rounded-full p-1 relative transition-colors focus:outline-none border border-gray-200"
          >
            <div 
              :class="isYearly ? 'translate-x-8 bg-blue-600' : 'translate-x-0 bg-gray-400'"
              class="w-6 h-6 rounded-full transition-transform duration-300 shadow-sm"
            ></div>
          </button>
          <div class="flex items-center gap-2">
            <span :class="isYearly ? 'text-gray-900 font-bold' : 'text-gray-400'" class="text-sm uppercase tracking-widest transition-colors">Godišnje</span>
            <span class="bg-green-100 text-green-700 text-[10px] font-black px-2 py-0.5 rounded-full uppercase border border-green-200">-10% POPUSTA</span>
          </div>
        </div>
      </div>

      <!-- Pricing Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div 
          v-for="plan in plans" 
          :key="plan.name"
          :class="plan.popular ? 'border-blue-600 ring-4 ring-blue-50' : 'border-gray-200'"
          class="bg-white border-2 rounded-3xl p-8 flex flex-col relative transition-all hover:scale-[1.02]"
        >
          <div v-if="plan.popular" class="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl">
            Najpopularnije
          </div>

          <div class="mb-8">
            <h3 class="text-2xl font-black text-gray-900 uppercase tracking-tight">{{ plan.name }}</h3>
            <p class="text-gray-400 text-sm font-bold uppercase tracking-widest">{{ plan.subtitle }}</p>
          </div>

          <div class="mb-8">
            <div class="flex items-baseline gap-1">
              <span class="text-4xl font-black text-gray-900">{{ isYearly ? plan.actualYearly : plan.monthly }}</span>
              <span class="text-gray-400 font-bold">RSD</span>
            </div>
            <p class="text-gray-400 text-xs font-bold uppercase tracking-widest mt-1">
              / {{ isYearly ? 'godina' : 'mesec' }}
            </p>
          </div>

          <ul class="space-y-4 mb-10 flex-1">
            <li v-for="feature in plan.features" :key="feature" class="flex items-center gap-3 text-sm font-medium text-gray-600">
              <span class="text-blue-500 font-bold">✓</span>
              {{ feature }}
            </li>
          </ul>

          <NuxtLink 
            to="/onboarding"
            :class="plan.popular ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200' : 'bg-gray-900 text-white hover:bg-black shadow-gray-200'"
            class="w-full py-4 rounded-2xl font-black text-center transition shadow-xl active:scale-95"
          >
            {{ plan.cta }}
          </NuxtLink>
        </div>
      </div>

      <!-- Bottom Boxes -->
      <div class="mt-12 space-y-4">
        <!-- Agency Expansion -->
        <div class="bg-gray-50 border border-gray-200 p-8 rounded-3xl flex flex-col md:flex-row justify-between items-center gap-6">
          <div class="text-center md:text-left">
            <h4 class="text-lg font-black text-gray-900 uppercase tracking-tight">Vodite više od 50 firmi?</h4>
            <p class="text-gray-500 text-sm font-medium mt-1">
              Naš Agency paket se širi sa Vama. Svaki dodatni PIB je samo <strong>300 RSD</strong> mesečno. 
              Idealno za velike knjigovodstvene sisteme.
            </p>
          </div>
          <NuxtLink to="/docs" class="text-blue-600 font-black uppercase text-sm tracking-widest hover:underline whitespace-nowrap">
            Kontaktirajte nas za partnerski ugovor &rarr;
          </NuxtLink>
        </div>

        <!-- Enterprise -->
        <div class="bg-blue-900 text-white p-8 rounded-3xl flex flex-col md:flex-row justify-between items-center gap-6 shadow-2xl shadow-blue-200">
          <div class="text-center md:text-left">
            <h4 class="text-lg font-black uppercase tracking-tight">Enterprise Rešenja</h4>
            <p class="text-blue-200 text-sm font-medium mt-1">
              Dedicated resursi, On-Premises Cloudflare deployment i custom SLA za sisteme sa preko 100.000 faktura.
            </p>
          </div>
          <NuxtLink to="/docs" class="bg-white text-blue-900 px-8 py-3 rounded-xl font-black uppercase text-sm tracking-widest hover:bg-blue-50 transition shadow-xl whitespace-nowrap">
            Zakažite sastanak sa IT timom
          </NuxtLink>
        </div>
      </div>
    </div>
  </section>
</template>
