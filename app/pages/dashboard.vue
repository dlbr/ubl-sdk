<script setup lang="ts">
const { getStats, getLogs, triggerSync, updateWebhook } = useSefApi()
const { klijentId, logout } = useSefAuth()

const invoiceTableRef = ref()

// Reaktivno dohvatanje podataka
const { data: statsData, pending: statsPending, refresh: refreshStats } = await getStats()
const { data: logsData, pending: logsPending, refresh: refreshLogs } = await getLogs()

const syncLoading = ref(false)
const webhookUrl = ref('')
const showCopyStatus = ref(false)

const licencaSkoroIstice = computed(() => {
  if (!statsData.value?.licenca_istice_timestamp) return false
  const preostaloMs = parseInt(statsData.value.licenca_istice_timestamp) - Date.now()
  const petnaestDanaMs = 15 * 24 * 60 * 60 * 1000
  return preostaloMs > 0 && preostaloMs <= petnaestDanaMs
})

const limitPotrosen = computed(() => {
  if (!statsData.value?.usage) return false
  return statsData.value.usage.procenat >= 100
})

// OKLOP: Inicijalizujemo klijentId iz dešifrovanih podataka sa servera
watch(statsData, (newData) => {
  if (newData?.klijent_id) {
    login(newData.klijent_id)
  }
  if (newData?.webhook_url) {
    webhookUrl.value = newData.webhook_url
  }
}, { once: true })

const handleSync = async () => {
  syncLoading.value = true
  try {
    await triggerSync()
    // Osvežavamo podatke bez resetovanja korisničkog unosa u formi
    await Promise.all([
      refreshStats(), 
      refreshLogs(),
      invoiceTableRef.value?.refresh()
    ])
  } finally {
    syncLoading.value = false
  }
}

const handleWebhookUpdate = async () => {
  if (!webhookUrl.value) return
  await updateWebhook(webhookUrl.value)
  alert('Webhook uspešno ažuriran!')
}

const copyId = async () => {
  if (!klijentId.value) return
  await navigator.clipboard.writeText(klijentId.value)
  showCopyStatus.value = true
  setTimeout(() => { showCopyStatus.value = false }, 2000)
}
</script>

<template>
  <div class="min-h-screen bg-gray-50/50 font-sans text-gray-900">
    <!-- Banner za potrošen limit -->
    <div v-if="limitPotrosen" class="bg-red-600 text-white text-center py-2 px-4 text-xs font-bold sticky top-0 z-[60] shadow-md uppercase tracking-wider flex items-center justify-center gap-4">
      <span>⚠️ PAŽNJA: Limit vašeg paketa je potrošen. Slanje novih faktura je privremeno suspendovano.</span>
      <NuxtLink to="/docs" class="bg-white text-red-600 px-3 py-1 rounded-md hover:bg-gray-100 transition shadow-sm">
        Nadogradi Paket &rarr;
      </NuxtLink>
    </div>

    <!-- Banner za skoro isticanje licence -->
    <div v-else-if="licencaSkoroIstice" class="bg-amber-600 text-white text-center py-2 px-4 text-xs font-bold sticky top-0 z-[60] shadow-md uppercase tracking-wider">
      ⚠️ Pažnja: Vaša godišnja licenca za SEF Bridge ističe uskoro. 
      Automatska obnova biće isporučena na Vaš SEF nalog 7 dana pre isteka.
    </div>

    <!-- Navigacija -->
    <nav class="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
            <span class="text-white font-black text-xl">S</span>
          </div>
          <span class="font-bold text-lg tracking-tight">SEF Bridge <span class="text-blue-600 text-xs uppercase ml-1 px-1.5 py-0.5 bg-blue-50 rounded">v2.0</span></span>
        </div>
        <div class="flex items-center gap-4">
          <button @click="logout" class="text-sm font-semibold text-gray-500 hover:text-red-600 transition flex items-center gap-2">
            Odjavi se 
            <span class="text-lg leading-none">×</span>
          </button>
        </div>
      </div>
    </nav>

    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Usage Tracker Oklop -->
      <div class="mb-8">
        <UsageWidget 
          :usage="statsData?.usage" 
          :plan-name="statsData?.plan_name"
          :billing-period="statsData?.billing_period"
        />
      </div>

      <!-- Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
          <div class="flex items-center gap-3">
            <h1 class="text-3xl font-black text-gray-900 tracking-tight">Kontrolna Tabla</h1>
            <span 
              v-if="statsData" 
              :class="statsData.environment === 'production' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-orange-100 text-orange-700 border-orange-200'"
              class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase border tracking-widest mt-1"
            >
              {{ statsData.environment }}
            </span>
          </div>
          <p class="text-gray-500 mt-1 font-medium">Pregled operacija i sinhronizacije za vaš PIB.</p>
        </div>
        <button 
          @click="handleSync" 
          :disabled="syncLoading || limitPotrosen"
          class="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:bg-gray-400 transition shadow-lg shadow-blue-200 gap-2 text-sm"
        >
          <span v-if="syncLoading" class="animate-spin">🔄</span>
          <span v-else-if="limitPotrosen">🔒</span>
          <span v-else>⚡</span>
          {{ syncLoading ? 'Sinhronizacija...' : (limitPotrosen ? 'Limit Potrošen' : 'Osveži sa SEF-a') }}
        </button>
      </div>

      <!-- Stats Grid -->
      <div v-if="!statsPending" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div v-for="stat in statsData?.stats" :key="stat.status" class="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <p class="text-sm text-gray-500 font-medium uppercase tracking-wider">{{ stat.status }}</p>
          <p class="text-3xl font-bold text-gray-900 mt-1">{{ stat.broj }}</p>
        </div>
        <div class="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <p class="text-sm text-gray-500 font-medium uppercase tracking-wider">Greške (24h)</p>
          <p class="text-3xl font-bold mt-1" :class="(statsData?.health ?? 0) > 0 ? 'text-red-600' : 'text-green-600'">
            {{ statsData?.health ?? 0 }}
          </p>
        </div>
      </div>
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div v-for="i in 4" :key="i" class="h-24 bg-gray-200 animate-pulse rounded-xl"></div>
      </div>

      <!-- Main Content Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div class="lg:col-span-2 space-y-8">
          <!-- Tabela Faktura -->
          <InvoiceTable ref="invoiceTableRef" />

          <!-- Logovi Table -->
          <div class="space-y-4">
            <div class="flex justify-between items-center">
              <h2 class="text-base font-bold text-gray-900">Zadnje greške na SEF API-ju</h2>
              <button @click="() => refreshLogs()" class="text-xs text-blue-600 font-semibold hover:underline">Osveži logove</button>
            </div>
            <div class="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <table class="w-full text-left border-collapse">
                <thead class="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th class="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">SEF ID / Internal ID</th>
                    <th class="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Greška</th>
                    <th class="px-6 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Vreme (sr-RS)</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 bg-white">
                  <tr v-if="logsPending" v-for="i in 3" :key="'loading-' + i">
                    <td colspan="3" class="px-6 py-4 h-12 bg-gray-50/50 animate-pulse"></td>
                  </tr>
                  <tr v-else-if="!logsData?.logs?.length">
                    <td colspan="3" class="px-6 py-8 text-center text-sm text-gray-400 italic">Nema zabeleženih grešaka u bazi. Sistem je zdrav.</td>
                  </tr>
                  <tr v-for="(log, indeks) in logsData?.logs" :key="`log-${log.sef_id || log.internal_id || indeks}`" class="hover:bg-gray-50 transition">
                    <td class="px-6 py-4 font-mono text-xs text-blue-600 font-semibold max-w-[180px] truncate">
                      {{ log.sef_id || log.internal_id || 'N/A' }}
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-700 font-medium">
                      {{ log.error_message }}
                    </td>
                    <td class="px-6 py-4 text-xs text-gray-400 font-mono">
                      {{ log.kreirano_u ? new Date(log.kreirano_u).toLocaleString('sr-RS') : 'N/A' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="space-y-6">
          <h2 class="text-lg font-bold text-gray-900">ERP Integracija</h2>
          
          <div class="bg-white border border-gray-200 p-6 rounded-xl shadow-sm space-y-3">
            <div>
              <label class="text-xs font-bold text-gray-400 uppercase tracking-widest block">Vaš Autentifikacioni Ključ</label>
              <div class="mt-2 flex items-center gap-2">
                <code class="flex-1 bg-gray-50 p-2.5 rounded text-xs font-mono break-all border border-gray-200 text-gray-600">
                  {{ klijentId }}
                </code>
                <button @click="copyId" class="p-2 hover:bg-gray-100 rounded transition border border-gray-200 bg-white shadow-sm flex items-center justify-center min-w-[40px]">
                  <span v-if="!showCopyStatus" class="text-sm">📋</span>
                  <span v-else class="text-green-600 text-xs font-bold">OK</span>
                </button>
              </div>
            </div>
          </div>

          <div class="bg-white border border-gray-200 p-6 rounded-xl shadow-sm space-y-4">
            <div>
              <label class="text-xs font-bold text-gray-400 uppercase tracking-widest block">Klijentski Webhook URL</label>
              <p class="text-xs text-gray-400 mt-1 italic">Slaćemo notifikacije na ovaj URL pri svakoj promeni statusa na SEF-u.</p>
              <input 
                v-model="webhookUrl" 
                type="url" 
                placeholder="https://vas-erp.rs/webhook"
                class="mt-2 w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition bg-white"
              />
            </div>
            <button 
              @click="handleWebhookUpdate"
              class="w-full py-2.5 bg-gray-900 text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-black transition shadow-sm"
            >
              Sačuvaj Webhook URL
            </button>
          </div>
          
          <div class="bg-blue-50 border border-blue-100 p-4 rounded-xl text-center">
            <NuxtLink to="/docs" class="text-blue-900 font-bold underline text-sm">Kompletna API specifikacija &rarr;</NuxtLink>
          </div>

          <!-- Subscription Management -->
          <div class="bg-white border border-gray-200 p-6 rounded-xl shadow-sm space-y-4">
            <h3 class="text-xs font-black text-gray-400 uppercase tracking-widest">Pretplata i Licenca</h3>
            <div class="flex justify-between items-center">
              <span class="text-sm font-medium text-gray-600">Plan:</span>
              <span class="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-[10px] font-black uppercase">{{ statsData?.plan_name }}</span>
            </div>
            <div v-if="statsData?.licenca_istice_timestamp" class="flex justify-between items-center">
              <span class="text-sm font-medium text-gray-600">Ističe:</span>
              <span class="text-xs font-mono font-bold">{{ new Date(parseInt(statsData.licenca_istice_timestamp)).toLocaleDateString('sr-RS') }}</span>
            </div>
            <button 
              v-if="statsData?.status_pretplate === 'AKTIVAN'"
              @click="async () => { await useSefApi().cancelSubscription(); refreshStats(); }"
              class="w-full py-2 border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200 rounded-lg text-[10px] font-bold uppercase transition"
            >
              Otkaži obnovu
            </button>
            <div v-else-if="statsData?.status_pretplate === 'U_OTKAZNOM_ROKU'" class="text-[10px] text-orange-600 font-bold text-center bg-orange-50 p-2 rounded-lg">
              Automatska obnova je isključena.
            </div>
          </div>
        </div>
      </div>

      <div class="mt-12 pb-12 border-t border-gray-200 pt-8">
        <h2 class="text-lg font-bold text-gray-900 mb-4 px-1">Podešavanje Državnih Webhook-ova</h2>
        <SefWebhookSetup :klijent-id="klijentId || ''" />
      </div>
    </main>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap');

.font-sans { font-family: 'Inter', sans-serif; }
.font-mono { font-family: 'JetBrains Mono', monospace; }
</style>
