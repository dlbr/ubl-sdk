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

// Inicijalizacija webhook URL-a ako postoji
watch(statsData, (newData) => {
  if (newData?.webhook_url) {
    webhookUrl.value = newData.webhook_url
  }
}, { immediate: true })

const handleSync = async () => {
  syncLoading.value = true
  try {
    await triggerSync()
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
  await updateWebhook(webhookUrl.value)
  alert('Webhook uspešno ažuriran!')
}

const copyId = () => {
  navigator.clipboard.writeText(klijentId.value || '')
  showCopyStatus.value = true
  setTimeout(() => showCopyStatus.value = false, 2000)
}

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    'Approved': 'bg-green-100 text-green-800',
    'Paid': 'bg-blue-100 text-blue-800',
    'Rejected': 'bg-red-100 text-red-800',
    'Pending': 'bg-yellow-100 text-yellow-800',
    'Viewed': 'bg-purple-100 text-purple-800',
    'Stale': 'bg-gray-100 text-gray-800'
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 font-sans">
    <!-- Navigacija -->
    <nav class="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white font-bold">S</div>
        <span class="text-xl font-bold text-gray-900 tracking-tight">SEF Bridge <span class="text-blue-600">v1</span></span>
      </div>
      <div class="flex items-center gap-4">
        <span class="text-sm text-gray-500 hidden sm:inline">Tenant: {{ klijentId }}</span>
        <button @click="logout" class="text-sm font-medium text-red-600 hover:text-red-700 transition">Odjavi se</button>
      </div>
    </nav>

    <main class="max-w-7xl mx-auto p-6 space-y-8">
      <!-- Hero / Header -->
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Operativni Dashboard</h1>
          <p class="text-gray-500">Nadzor sinhronizacije i zdravlje API konekcije u realnom vremenu.</p>
        </div>
        <button 
          @click="handleSync" 
          :disabled="syncLoading"
          class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition shadow-sm"
        >
          <span v-if="syncLoading" class="mr-2 animate-spin">◌</span>
          Pokreni Ručni Sync
        </button>
      </div>

      <!-- Stats Grid -->
      <div v-if="!statsPending" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
      <div v-else class="grid grid-cols-4 gap-4">
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
            <h2 class="text-lg font-bold text-gray-900 font-sans">Zadnje greške na SEF API-ju</h2>
            <button @click="() => refreshLogs()" class="text-sm text-blue-600 font-medium hover:underline">Osveži</button>
          </div>
          <div class="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <table class="w-full text-left">
              <thead class="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th class="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">SEF ID</th>
                  <th class="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Greška</th>
                  <th class="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Vreme</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr v-if="logsPending" v-for="i in 3" :key="i">
                  <td colspan="3" class="px-6 py-4 h-12 bg-gray-50/50 animate-pulse"></td>
                </tr>
                <tr v-else-if="!logsData?.logs?.length">
                  <td colspan="3" class="px-6 py-8 text-center text-gray-400 italic">Nema zabeleženih grešaka u bazi. Sistem je zdrav.</td>
                </tr>
                <tr v-for="log in logsData?.logs" :key="log.id" class="hover:bg-gray-50 transition">
                  <td class="px-6 py-4 font-mono text-sm text-blue-600">{{ log.sef_id }}</td>
                  <td class="px-6 py-4 text-sm text-gray-700">{{ log.error_message }}</td>
                  <td class="px-6 py-4 text-xs text-gray-400">{{ new Date(log.kreirano_u).toLocaleString('sr-RS') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Integration Settings -->
        <div class="space-y-6">
          <h2 class="text-lg font-bold text-gray-900">ERP Integracija</h2>
          
          <!-- API Key Box -->
          <div class="bg-white border border-gray-200 p-6 rounded-xl shadow-sm space-y-4">
            <div>
              <label class="text-xs font-bold text-gray-500 uppercase tracking-widest">X-Klijent-ID (Vaš API Token)</label>
              <div class="mt-2 flex items-center gap-2">
                <code class="flex-1 bg-gray-100 p-2 rounded text-xs font-mono break-all border border-gray-200">{{ klijentId }}</code>
                <button @click="copyId" class="p-2 hover:bg-gray-100 rounded transition border border-gray-200">
                  <span v-if="!showCopyStatus">📋</span>
                  <span v-else class="text-green-600 text-xs font-bold">OK</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Webhook Box -->
          <div class="bg-white border border-gray-200 p-6 rounded-xl shadow-sm space-y-4">
            <div>
              <label class="text-xs font-bold text-gray-500 uppercase tracking-widest">Webhook URL</label>
              <p class="text-xs text-gray-400 mt-1 italic">Slaćemo notifikacije na ovaj URL pri svakoj promeni statusa na SEF-u.</p>
              <input 
                v-model="webhookUrl" 
                type="url" 
                placeholder="https://vas-erp.rs/webhook"
                class="mt-2 w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
              />
            </div>
            <button 
              @click="handleWebhookUpdate"
              class="w-full py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-black transition"
            >
              Sačuvaj Webhook
            </button>
          </div>
          
          <div class="bg-blue-50 border border-blue-100 p-4 rounded-xl">
            <h3 class="text-sm font-bold text-blue-800">Dokumentacija</h3>
            <p class="text-xs text-blue-700 mt-1">Sve fakture šaljite na <code>/api/fakture/batch</code> endpoint. Pogledajte kompletnu specifikaciju u README fajlu.</p>
          </div>
        </div>
      </div>

      <!-- Webhook Setup Section -->
      <div class="mt-12 pb-12">
        <h2 class="text-lg font-bold text-gray-900 mb-4 px-1">Podešavanje Državnih Webhook-ova</h2>
        <SefWebhookSetup :klijent-id="klijentId || ''" />
      </div>
    </main>
  </div>
</template>

<style scoped>
/* Nuxt 4 Tailwind v4 ready styles */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono&display=swap');

.font-sans { font-family: 'Inter', sans-serif; }
.font-mono { font-family: 'JetBrains Mono', monospace; }
</style>
