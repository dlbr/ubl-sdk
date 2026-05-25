<template>
  <div class="p-6 bg-gray-900 min-h-screen text-white">
    <div class="flex justify-between items-center mb-6">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">📄 Izlazni Dokumenti (eFakture)</h1>
        <p class="text-sm text-gray-400 mt-1">Pregled i pretraga dokumenata u realnom vremenu iz lokalnog D1 ogledala.</p>
      </div>
      <div class="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-full font-mono flex items-center gap-1.5">
        <span class="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
        Webhook Sinhronizacija Aktivna
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
      <div class="bg-gray-850 p-5 rounded-xl border border-gray-750 flex items-center justify-between shadow-lg">
        <div>
          <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Ukupno dokumenata</p>
          <h3 class="text-2xl font-bold mt-2 font-mono text-gray-100">
            {{ pending ? '...' : response?.stats?.ukupno_dokumenata }}
          </h3>
          <p class="text-xs text-gray-500 mt-1">Sinhronizovano u lokalni D1</p>
        </div>
        <div class="w-12 h-12 rounded-lg bg-gray-800 border border-gray-755 flex items-center justify-center text-xl shadow-inner">
          🗂️
        </div>
      </div>

      <div class="bg-gray-850 p-5 rounded-xl border border-gray-750 flex items-center justify-between shadow-lg">
        <div>
          <p class="text-xs font-semibold text-blue-400 uppercase tracking-wider">Potraživanja u najavi</p>
          <h3 class="text-2xl font-bold mt-2 font-mono text-blue-400">
            {{ pending ? '...' : formatirajIznos(response?.stats?.potrazivanja_u_najavi) }} <span class="text-xs font-sans">RSD</span>
          </h3>
          <p class="text-xs text-gray-500 mt-1">Dokumenti u statusu "Poslato"</p>
        </div>
        <div class="w-12 h-12 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-xl shadow-inner">
          ⏳
        </div>
      </div>

      <div class="bg-gray-850 p-5 rounded-xl border border-gray-750 flex items-center justify-between shadow-lg">
        <div>
          <p class="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Realizovan prihod</p>
          <h3 class="text-2xl font-bold mt-2 font-mono text-emerald-400">
            {{ pending ? '...' : formatirajIznos(response?.stats?.realizovan_prihod) }} <span class="text-xs font-sans">RSD</span>
          </h3>
          <p class="text-xs text-gray-500 mt-1">Dokumenti uspešno odobreni</p>
        </div>
        <div class="w-12 h-12 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xl shadow-inner">
          💰
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div class="relative">
        <input 
          v-model="searchQuery" 
          type="text" 
          placeholder="Pretraži po broju fakture..." 
          class="w-full bg-gray-800 border border-gray-750 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
        />
      </div>

      <div>
        <select 
          v-model="izabraniStatus" 
          class="w-full bg-gray-800 border border-gray-750 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition"
        >
          <option value="">Svi statusi</option>
          <option value="Sent">Poslato (Sent)</option>
          <option value="Approved">Odobreno (Approved)</option>
          <option value="Rejected">Odbijeno (Rejected)</option>
        </select>
      </div>

      <div>
        <select 
          v-model="stavkiPoStranici" 
          class="w-full bg-gray-800 border border-gray-750 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition"
        >
          <option :value="10">10 dokumenata po stranici</option>
          <option :value="25">25 dokumenata po stranici</option>
          <option :value="50">50 dokumenata po stranici</option>
        </select>
      </div>
    </div>

    <div class="bg-gray-850 rounded-xl border border-gray-750 overflow-hidden shadow-xl">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="border-b border-gray-750 bg-gray-800/50 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              <th class="p-4">Broj dokumenta</th>
              <th class="p-4">Kupac</th>
              <th class="p-4">PIB Kupca</th>
              <th class="p-4">Datum slanja</th>
              <th class="p-4">Iznos sa PDV-om</th>
              <th class="p-4 text-center">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-750 text-sm">
            <tr v-if="pending" v-for="n in 5" :key="'loader-'+n" class="animate-pulse">
              <td class="p-4" v-for="i in 6" :key="'cell-'+i">
                <div class="h-4 bg-gray-750 rounded w-3/4"></div>
              </td>
            </tr>

            <tr v-if="!pending && (!response?.data || response.data.length === 0)">
              <td colspan="6" class="p-12 text-center text-gray-500">
                <span class="block text-2xl mb-2">🔍</span>
                Nema pronađenih faktura za izabrane filtere.
              </td>
            </tr>

            <tr 
              v-if="!pending" 
              v-for="faktura in response?.data" 
              :key="faktura.id"
              class="hover:bg-gray-800/30 transition duration-150"
            >
              <td class="p-4 font-mono font-medium text-blue-400">{{ faktura.broj_fakture }}</td>
              <td class="p-4 font-medium text-gray-200">{{ faktura.kupac_naziv }}</td>
              <td class="p-4 text-gray-400 font-mono text-xs">{{ faktura.kupac_pib }}</td>
              <td class="p-4 text-gray-400">{{ formatirajDatum(faktura.datum_slanja) }}</td>
              <td class="p-4 font-semibold text-right md:text-left">{{ formatirajIznos(faktura.iznos_sa_pdv) }} RSD</td>
              <td class="p-4 text-center">
                <span :class="mapirajStatusKlasu(faktura.status)" class="text-xs px-2.5 py-1 rounded-full font-medium inline-block min-w-[90px]">
                  {{ mapirajStatusSrpski(faktura.status) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="response?.meta" class="bg-gray-850 p-4 border-t border-gray-750 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
        <div>
          Prikazano <span class="text-white font-medium">{{ response.data?.length || 0 }}</span>
        </div>

        <div class="flex items-center space-x-2">
          <button 
            :disabled="trenutnaStranica === 1" 
            @click="trenutnaStranica--" 
            class="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-750 text-white disabled:opacity-30 transition"
          >
            Prethodna
          </button>
          
          <div class="px-4 py-1.5 bg-gray-800/50 border border-gray-750 rounded-lg text-xs font-mono text-gray-300">
            Stranica {{ trenutnaStranica }}
          </div>

          <button 
            :disabled="!response?.data || response.data.length < stavkiPoStranici" 
            @click="trenutnaStranica++" 
            class="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-750 text-white disabled:opacity-30 transition"
          >
            Sledeća
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';

const trenutnaStranica = ref(1);
const stavkiPoStranici = ref(10);
const izabraniStatus = ref('');
const searchQuery = ref('');

const { data: response, pending, refresh } = await useFetch('/api/api/dokumenti/izlazni', {
  query: {
    page: trenutnaStranica,
    limit: stavkiPoStranici,
    status: izabraniStatus,
    search: searchQuery
  }
});

watch([trenutnaStranica, stavkiPoStranici, izabraniStatus, searchQuery], () => {
  refresh();
});

const formatirajIznos = (iznos) => {
  return new Intl.NumberFormat('sr-RS', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(iznos);
};

const formatirajDatum = (isoString) => {
  if (!isoString) return '-';
  return new Date(isoString).toLocaleDateString('sr-RS', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const mapirajStatusSrpski = (status) => {
  const mape = {
    'Sent': 'Poslato',
    'Approved': 'Odobreno',
    'Rejected': 'Odbijeno',
    'Storno': 'Stornirano'
  };
  return mape[status] || status;
};

const mapirajStatusKlasu = (status) => {
  const mape = {
    'Sent': 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    'Approved': 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    'Rejected': 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
    'Storno': 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
  };
  return mape[status] || 'bg-gray-500/10 text-gray-400 border border-gray-500/20';
};
</script>
