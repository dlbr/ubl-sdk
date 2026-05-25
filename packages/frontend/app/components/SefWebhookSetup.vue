<template>
  <div class="p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-6">
    <div class="border-b border-gray-200 pb-4">
      <h2 class="text-xl font-bold text-gray-900 flex items-center gap-2">
        <span class="p-2 bg-green-100 text-green-700 rounded-lg text-sm">✓</span>
        Povezivanje sa Državnim SEF Portalom (Push Notifikacije)
      </h2>
      <p class="text-sm text-gray-500 mt-1">
        Pratite korake ispod da biste omogućili instant osvežavanje ulaznih i izlaznih faktura na vašem dashboard-u.
      </p>
    </div>

    <div v-if="pending" class="animate-pulse space-y-4">
      <div class="h-4 bg-gray-200 rounded w-1/4"></div>
      <div class="h-10 bg-gray-200 rounded"></div>
    </div>

    <div v-else-if="error" class="p-4 bg-red-50 text-red-700 rounded-lg text-sm">
      Greška pri učitavanju konfiguracije: {{ error.message }}
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="space-y-4">
        <h3 class="text-sm font-semibold text-gray-700 uppercase tracking-wider">Operativno Uputstvo</h3>
        <ol class="space-y-3">
          <li v-for="(korak, index) in webhookData?.data?.koraci" :key="index" class="text-sm text-gray-600 flex gap-2">
            <span class="font-bold text-gray-900">{{ Number(index) + 1 }}.</span>
            {{ korak }}
          </li>
        </ol>
      </div>

      <div class="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
        <h3 class="text-sm font-semibold text-gray-700 uppercase tracking-wider">API Endpointi za SEF Panel</h3>
        
        <div class="space-y-1">
          <label class="text-xs font-medium text-gray-500 block">URL za primanje notifikacija o izlaznim fakturama</label>
          <div class="flex rounded-md shadow-sm">
            <input 
              type="text" 
              readonly 
              :value="webhookData?.data?.fields?.sales_url" 
              class="flex-1 block w-full px-3 py-2 text-xs font-mono bg-white border border-gray-300 rounded-l-md focus:outline-none"
            />
            <button 
              @click="copyText(webhookData?.data?.fields?.sales_url, 'sales')" 
              :class="copiedState.sales ? 'bg-green-600' : 'bg-slate-800 hover:bg-slate-700'"
              class="inline-flex items-center px-4 rounded-r-md border border-l-0 border-transparent text-xs font-medium text-white transition-colors duration-200"
            >
              {{ copiedState.sales ? 'Kopirano!' : 'Kopiraj' }}
            </button>
          </div>
        </div>

        <div class="space-y-1">
          <label class="text-xs font-medium text-gray-500 block">URL za primanje notifikacija o ulaznim fakturama</label>
          <div class="flex rounded-md shadow-sm">
            <input 
              type="text" 
              readonly 
              :value="webhookData?.data?.fields?.purchase_url" 
              class="flex-1 block w-full px-3 py-2 text-xs font-mono bg-white border border-gray-300 rounded-l-md focus:outline-none"
            />
            <button 
              @click="copyText(webhookData?.data?.fields?.purchase_url, 'purchase')" 
              :class="copiedState.purchase ? 'bg-green-600' : 'bg-slate-800 hover:bg-slate-700'"
              class="inline-flex items-center px-4 rounded-r-md border border-l-0 border-transparent text-xs font-medium text-white transition-colors duration-200"
            >
              {{ copiedState.purchase ? 'Kopirano!' : 'Kopiraj' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';

const props = defineProps<{
  klijentId: string
}>()

// Povlačenje podataka sa Nitro servera
const { data: webhookData, pending, error } = await useFetch('/api/webhook-setup', {
  headers: {
    'X-Klijent-ID': props.klijentId
  }
});

// Stanje za Clipboard animaciju dugmića
const copiedState = reactive({
  sales: false,
  purchase: false
});

const copyText = async (text: string | undefined, type: 'sales' | 'purchase') => {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copiedState[type] = true;
    
    // Vraćamo natpis u normalu nakon 2 sekunde
    setTimeout(() => {
      copiedState[type] = false;
    }, 2000);
  } catch (err) {
    console.error('Clipboard greška:', err);
  }
};
</script>
