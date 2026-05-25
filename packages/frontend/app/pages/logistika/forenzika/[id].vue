<template>
  <div v-if="recon" class="space-y-8 pb-20">
    <!-- Security Badge Header -->
    <div :class="['p-8 rounded-2xl border flex flex-col items-center justify-center text-center shadow-lg transition-all', badgeClass]">
       <div class="text-5xl mb-4">{{ recon.meta.statusZastite.split(' ')[1] }}</div>
       <h2 class="text-3xl font-black uppercase tracking-widest">{{ recon.meta.statusZastite.split(' ')[0] }}</h2>
       <p class="mt-2 text-sm opacity-80 font-medium tracking-tight">
         Forenzička verifikacija izvršena: {{ new Date(recon.meta.verifikovanoAt).toLocaleString() }}
       </p>
    </div>

    <!-- Deep SQL Analytics Table -->
    <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div class="px-6 py-4 bg-gray-50 border-b border-gray-100">
        <h3 class="font-bold text-gray-900 uppercase text-xs tracking-widest">Uporedna analiza stavki (Otprema vs Prijem)</h3>
      </div>
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-white text-[10px] font-black text-gray-400 uppercase tracking-widest">
          <tr>
            <th class="px-6 py-4 text-left">Artikal</th>
            <th class="px-6 py-4 text-center">Poslato</th>
            <th class="px-6 py-4 text-center">Primljeno</th>
            <th class="px-6 py-4 text-center">Manjak</th>
            <th class="px-6 py-4 text-center bg-gray-50">ρ Otprema</th>
            <th class="px-6 py-4 text-center bg-gray-50">ρ Prijem</th>
            <th class="px-6 py-4 text-center bg-gray-50">Devijacija ρ</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="s in recon.stavke" :key="s.stavka_otpremnice_id" 
            :class="[
              'transition-colors',
              Math.abs(s.devijacija_gustine) > 0.0001 ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50',
              s.kvantitativni_manjak > 0 ? 'bg-orange-50/30' : ''
            ]"
          >
            <td class="px-6 py-4">
               <div class="font-bold text-gray-900">{{ s.artikal_naziv }}</div>
               <div class="text-[10px] text-gray-400 font-mono">ID: {{ s.stavka_otpremnice_id }}</div>
            </td>
            <td class="px-6 py-4 text-center font-medium">{{ s.poslata_kolicina }}</td>
            <td class="px-6 py-4 text-center font-medium">{{ s.primljena_kolicina }}</td>
            <td class="px-6 py-4 text-center font-black" :class="s.kvantitativni_manjak > 0 ? 'text-orange-600' : 'text-gray-300'">
              {{ s.kvantitativni_manjak }}
            </td>
            <td class="px-6 py-4 text-center font-mono text-xs bg-gray-50/50">{{ s.gustina_otprema?.toFixed(4) || '-' }}</td>
            <td class="px-6 py-4 text-center font-mono text-xs bg-gray-50/50">{{ s.gustina_prijem?.toFixed(4) || '-' }}</td>
            <td class="px-6 py-4 text-center font-mono text-xs bg-gray-50/50" :class="Math.abs(s.devijacija_gustine) > 0.0001 ? 'text-red-600 font-bold' : 'text-green-600'">
              {{ s.devijacija_gustine?.toFixed(4) || '0.0000' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Alert for anomalies -->
    <div v-if="hasCriticalBreach" class="bg-red-600 p-6 rounded-2xl text-white shadow-xl flex items-start space-x-4 animate-bounce">
       <div class="text-3xl">🚨</div>
       <div>
         <h4 class="font-black uppercase tracking-tighter text-xl">Kritična Anomalija Detektovana</h4>
         <p class="text-sm font-medium opacity-90">Sistem je identifikovao devijaciju u gustini koja ukazuje na manipulaciju gorivom ili neovlašćeno pražnjenje tokom transporta.</p>
       </div>
    </div>
  </div>
  <div v-else-if="pending" class="flex flex-col items-center justify-center h-96 space-y-4">
    <div class="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    <p class="text-gray-500 font-bold uppercase tracking-widest text-xs">Pokrećem SQL forenziku...</p>
  </div>
</template>

<script setup lang="ts">
import { useLogistics } from '~/composables/useLogistics'

const route = useRoute()
const { getReconciliation } = useLogistics()

const { data: recon, pending } = await getReconciliation(route.params.id as string)

const badgeClass = computed(() => {
  if (!recon.value) return ''
  const status = recon.value.meta.statusZastite
  if (status.includes('SECURE')) return 'bg-green-600 text-white border-green-700'
  if (status.includes('QUANTITY')) return 'bg-orange-500 text-white border-orange-600'
  return 'bg-red-700 text-white border-red-800'
})

const hasCriticalBreach = computed(() => 
  recon.value?.stavke.some(s => Math.abs(s.devijacija_gustine) > 0.0001)
)
</script>
