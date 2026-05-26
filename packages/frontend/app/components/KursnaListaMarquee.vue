<script setup lang="ts">
interface TikerStavka {
  valuta: string;
  kurs: number;
  promenaProcenat: number;
  smer: 'GORE' | 'DOLE' | 'ISTO';
}

const props = defineProps<{
  tikerPodaci: TikerStavka[]
}>()

// Tripliramo niz kako bismo imali savršen, beskonačan fluidni prelaz bez praznina na ekranu
const renderLista = computed(() => {
  return [...props.tikerPodaci, ...props.tikerPodaci, ...props.tikerPodaci]
})
</script>

<template>
  <div class="w-full overflow-hidden bg-slate-950 border-y border-slate-900 py-3 text-sm select-none">
    <div class="flex w-max animate-marquee whitespace-nowrap hover:[animation-play-state:paused] cursor-pointer">
      <div 
        v-for="(stavka, indeks) in renderLista" 
        :key="indeks" 
        class="flex items-center mx-10 font-medium tracking-wide text-slate-300"
      >
        <span class="bg-slate-900 text-slate-400 px-2 py-0.5 rounded text-xs mr-2.5 border border-slate-800 font-mono">
          {{ stavka.valuta }}
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
