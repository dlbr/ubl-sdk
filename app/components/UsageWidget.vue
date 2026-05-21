<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  usage?: {
    potroseno: number;
    limit: number;
    procenat: number;
    prikazi_brojac: boolean;
  },
  planName?: string,
  billingPeriod?: string
}>()

// Dinamičke klase za boju linije u zavisnosti od procenta
const barColorClass = computed(() => {
  if (!props.usage) return 'bg-green-600'
  if (props.usage.procenat >= 90) return 'bg-red-600 animate-pulse'
  if (props.usage.procenat >= 75) return 'bg-amber-500'
  return 'bg-green-500'
})
</script>

<template>
  <div v-if="usage?.prikazi_brojac" class="p-6 bg-white rounded-xl border border-gray-200 shadow-sm transition-all hover:shadow-md">
    <div class="flex justify-between items-center mb-4">
      <div>
        <h3 class="text-sm font-black text-gray-400 uppercase tracking-widest">Potrošnja Paketa ({{ planName }})</h3>
        <p class="text-xs text-gray-400 mt-0.5 font-medium">Obračunski period: {{ billingPeriod === 'annual' ? 'Godišnji (Kumulativno)' : 'Mesečni' }}</p>
      </div>
      <div class="text-right">
        <span class="text-2xl font-black text-gray-900 leading-none">{{ usage.procenat }}%</span>
        <div class="text-[10px] text-gray-400 uppercase font-black tracking-tighter mt-1">Iskorišćeno</div>
      </div>
    </div>

    <div class="w-full bg-gray-100 rounded-full h-3 overflow-hidden border border-gray-100 p-[1px]">
      <div 
        :class="barColorClass" 
        :style="{ width: Math.min(usage.procenat, 100) + '%' }" 
        class="h-full rounded-full transition-all duration-1000 ease-out shadow-sm"
      ></div>
    </div>

    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-4 gap-4">
      <div class="text-sm font-medium text-gray-600">
        Status: <strong class="text-gray-900">{{ usage.potroseno }}</strong> / {{ usage.limit }} <span class="text-gray-400 text-xs font-normal ml-1">e-faktura</span>
      </div>
      
      <NuxtLink 
        v-if="usage.procenat >= 75" 
        to="/docs" 
        class="group inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 text-xs font-black uppercase tracking-widest rounded-lg border border-indigo-100 hover:bg-indigo-100 transition-all shadow-sm"
      >
        <span>Proširi Paket</span>
        <span class="group-hover:translate-x-1 transition-transform">&rarr;</span>
      </NuxtLink>
    </div>
  </div>
</template>
