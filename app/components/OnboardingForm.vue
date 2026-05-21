<script setup lang="ts">
import { ref } from 'vue'

const { query, results, isLoading } = useSefSearch()
const { register } = useSefApi()
const { login } = useSefAuth()

const izabranaFirma = ref<any>(null)
const sefKey = ref('')
const isSubmitting = ref(false)
const error = ref('')

const selectCompany = (firma: any) => {
  izabranaFirma.value = firma
  query.value = '' // OKLOP: Čistimo input nakon selekcije
  results.value = []
}

const resetCompany = () => {
  izabranaFirma.value = null
  query.value = ''
  results.value = []
}

const handleRegister = async () => {
  if (!izabranaFirma.value || !sefKey.value) {
    error.value = 'Molimo izaberite firmu i unesite SEF ključ.'
    return
  }

  isSubmitting.value = true
  error.value = ''
  
  try {
    const res = await register(izabranaFirma.value.pib, izabranaFirma.value.naziv_firme, sefKey.value) as any
    if (res.success) {
      login(res.klijent_id)
      navigateTo('/dashboard')
    }
  } catch (e: any) {
    error.value = e.data?.error || 'Greška prilikom aktivacije sefa.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="max-w-xl mx-auto p-8 bg-white rounded-3xl shadow-2xl shadow-blue-100/50 border border-gray-100">
    <div class="flex items-center gap-3 mb-6">
      <div class="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black text-xl">S</div>
      <h2 class="text-2xl font-black text-gray-900 tracking-tight italic">Aktivacija SEF Bridge-a</h2>
    </div>
    
    <p class="text-gray-500 mb-8 font-medium">Pronađite vašu firmu u državnom registru i povežite svoj API ključ za Edge izolaciju.</p>

    <div class="space-y-6">
      <!-- Autocomplete Pretraga -->
      <div v-if="!izabranaFirma" class="relative">
        <label class="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2">Pretraga po Nazivu ili PIB-u</label>
        <div class="relative">
          <input
            v-model="query"
            type="text"
            placeholder="Npr. 123456789 ili Naziv d.o.o."
            class="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition font-bold text-gray-900"
          />
          <div v-if="isLoading" class="absolute right-4 top-1/2 -translate-y-1/2">
            <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        </div>
        
        <!-- Rezultati -->
        <ul v-if="results.length > 0" class="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-2xl shadow-2xl max-h-72 overflow-y-auto divide-y divide-gray-50">
          <li 
            v-for="firma in results" 
            :key="firma.pib"
            @click="selectCompany(firma)"
            class="px-5 py-4 hover:bg-blue-50 cursor-pointer transition text-left group"
          >
            <div class="font-bold text-gray-900 group-hover:text-blue-700 transition text-sm">{{ firma.naziv_firme }}</div>
            <div class="text-xs text-gray-400 mt-1 font-mono uppercase tracking-tighter">PIB: {{ firma.pib }} • MB: {{ firma.maticni_broj }}</div>
          </li>
        </ul>
      </div>

      <!-- Prikaz selekcije -->
      <transition enter-active-class="transition duration-200 ease-out" enter-from-class="transform scale-95 opacity-0" enter-to-class="transform scale-100 opacity-100">
        <div v-if="izabranaFirma" class="p-6 bg-blue-50 rounded-2xl border-2 border-blue-100 relative group flex items-center justify-between">
          <div class="flex-1">
            <div class="text-[10px] font-black text-blue-400 uppercase tracking-widest">Izabrani Entitet</div>
            <div class="font-black text-blue-900 mt-1 leading-tight text-lg">{{ izabranaFirma.naziv_firme }}</div>
            <div class="text-xs text-blue-600 mt-1 font-mono tracking-tighter font-bold uppercase">PIB: {{ izabranaFirma.pib }} • MB: {{ izabranaFirma.maticni_broj }}</div>
          </div>
          <button 
            @click="resetCompany" 
            class="ml-4 p-3 bg-white border border-blue-200 text-blue-400 hover:text-red-500 hover:border-red-200 rounded-xl transition shadow-sm flex items-center justify-center group/btn"
            title="Poništi selekciju"
          >
            <span class="text-lg leading-none font-bold">×</span>
          </button>
        </div>
      </transition>

      <!-- API Ključ -->
      <div>
        <label class="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2">Državni SEF API Ključ</label>
        <input
          v-model="sefKey"
          type="password"
          placeholder="Ulepite vaš tajni ključ"
          class="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition font-mono"
        />
        <p class="mt-2 text-[10px] text-gray-400 font-medium leading-tight px-1 italic">Vaš ključ se čuva u izolovanom SQLite sefu kojem samo vaš tenant ima pristup.</p>
      </div>

      <div v-if="error" class="p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold border border-red-100 animate-shake">
        {{ error }}
      </div>

      <button
        @click="handleRegister"
        :disabled="!izabranaFirma || !sefKey || isSubmitting"
        class="w-full bg-gray-900 hover:bg-black disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-black py-5 rounded-2xl transition shadow-xl shadow-gray-200 flex items-center justify-center gap-3 group active:scale-95"
      >
        <span v-if="isSubmitting" class="flex items-center gap-2">
          <div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          Inicijalizujem sef...
        </span>
        <span v-else class="flex items-center gap-2">
          Aktiviraj Moj Privatni Sef
          <span class="group-hover:translate-x-1 transition">→</span>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.animate-shake {
  animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
}
@keyframes shake {
  10%, 90% { transform: translate3d(-1px, 0, 0); }
  20%, 80% { transform: translate3d(2px, 0, 0); }
  30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
  40%, 60% { transform: translate3d(4px, 0, 0); }
}
</style>
