<script setup lang="ts">
interface TikerStavka {
  valuta: string;
  kurs: number;
  promenaProcenat: number;
  smer: 'GORE' | 'DOLE' | 'ISTO';
}

import { ref, computed } from 'vue'

const props = defineProps<{
  tikerPodaci: TikerStavka[]
}>()

// Tripliramo niz kako bismo imali savršen, beskonačan fluidni prelaz bez praznina na ekranu
const renderLista = computed(() => {
  return [...props.tikerPodaci, ...props.tikerPodaci, ...props.tikerPodaci]
})

const activeIndex = ref<number | null>(null)

const copyToClipboard = async (kurs: number, index: number) => {
  try {
    await navigator.clipboard.writeText(kurs.toFixed(4))
    activeIndex.value = index
    setTimeout(() => {
      if (activeIndex.value === index) {
        activeIndex.value = null
      }
    }, 1500)
  } catch (err) {
    console.error('Failed to copy rate:', err)
  }
}
</script>

<template>
  <div class="w-full overflow-hidden bg-slate-950 border-y border-slate-900 py-3 text-sm select-none">
    <div class="flex w-max animate-marquee whitespace-nowrap hover:[animation-play-state:paused] cursor-pointer">
      <div 
        v-for="(stavka, indeks) in renderLista" 
        :key="indeks" 
        @click="copyToClipboard(stavka.kurs, indeks)"
        class="flex items-center mx-10 font-medium tracking-wide text-slate-300 hover:text-white transition-colors duration-200"
        title="Klikni da kopiraš srednji kurs"
      >
        <span 
          class="px-2 py-0.5 rounded text-xs mr-2.5 border font-mono transition-all duration-300 flex items-center justify-center min-w-[50px] text-center"
          :class="[
            activeIndex === indeks 
              ? 'bg-emerald-600 text-white border-emerald-500 scale-105 font-bold' 
              : 'bg-slate-900 text-slate-400 border-slate-800'
          ]"
        >
          {{ activeIndex === indeks ? 'KOPIRANO' : stavka.valuta }}
        </span>
        
        <span class="text-white mr-2.5 font-mono tabular-nums">
          {{ stavka.kurs.toFixed(4) }}
        </span>
        
        <span 
          v-if="stavka.smer === 'GORE'" 
          class="text-emerald-500 flex items-center gap-0.5 font-semibold text-xs"
        >
          ▲ +{{ stavka.promenaProcenat.toFixed(4) }}%
        </span>

        <span 
          v-else-if="stavka.smer === 'DOLE'" 
          class="text-rose-500 flex items-center gap-0.5 font-semibold text-xs"
        >
          ▼ -{{ stavka.promenaProcenat.toFixed(4) }}%
        </span>

        <span 
          v-else 
          class="text-slate-500 font-semibold text-xs"
        >
          ■ 0.0000%
        </span>
      </div>
    </div>
  </div>
</template>
