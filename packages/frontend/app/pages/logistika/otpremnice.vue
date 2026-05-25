<template>
  <div class="space-y-6">
    <!-- Header sa akcijama -->
    <div class="flex justify-between items-center">
      <h1 class="text-2xl font-bold text-gray-900">Izlazne otpremnice (Prodaja)</h1>
      <button 
        @click="showCreateModal = true"
        class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition shadow-sm flex items-center"
      >
        <span class="mr-2">+</span> Nova Otpremnica
      </button>
    </div>

    <!-- Filteri -->
    <div class="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-wrap gap-4 items-end">
      <div>
        <label class="block text-xs font-semibold text-gray-500 uppercase mb-1">PIB Kupca</label>
        <input v-model="filters.pib" type="text" class="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="123456789">
      </div>
      <div>
        <label class="block text-xs font-semibold text-gray-500 uppercase mb-1">Status</label>
        <select v-model="filters.status" class="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48 focus:ring-2 focus:ring-blue-500 outline-none bg-white">
          <option value="">Svi statusi</option>
          <option value="PENDING_PROCESSING">Obrada u toku</option>
          <option value="SENT">Poslato na SEF</option>
          <option value="DISCREPANCY">Neslaganje</option>
        </select>
      </div>
      <button @click="refresh" class="bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-300 px-4 py-2 rounded-lg text-sm transition">
        Osveži
      </button>
    </div>

    <!-- Tabela -->
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50 text-gray-500 uppercase text-[11px] font-bold tracking-wider">
          <tr>
            <th class="px-6 py-3 text-left">Broj otpremnice</th>
            <th class="px-6 py-3 text-left">Kupac</th>
            <th class="px-6 py-3 text-left">Datum</th>
            <th class="px-6 py-3 text-left">Status</th>
            <th class="px-6 py-3 text-right">Akcije</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 text-sm text-gray-700">
          <tr v-for="doc in documents" :key="doc.id" class="hover:bg-gray-50 transition">
            <td class="px-6 py-4 font-mono font-medium">{{ doc.broj }}</td>
            <td class="px-6 py-4">{{ doc.pibKupca }}</td>
            <td class="px-6 py-4 text-gray-500">{{ doc.issueDate }}</td>
            <td class="px-6 py-4">
              <LogistikaStatusBadge :status="doc.status" />
            </td>
            <td class="px-6 py-4 text-right space-x-3">
              <NuxtLink :to="`/logistika/forenzika/${doc.id}`" class="text-blue-600 hover:text-blue-800 font-medium">Forenzika</NuxtLink>
              <NuxtLink :to="`/logistika/audit/${doc.id}`" class="text-gray-600 hover:text-gray-800 font-medium">Audit</NuxtLink>
            </td>
          </tr>
          <tr v-if="!documents?.length && !pending">
            <td colspan="5" class="px-6 py-12 text-center text-gray-400 italic">
              Nema pronađenih otpremnica za zadate filtere.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal za novu otpremnicu (Multi-step Placeholder) -->
    <Teleport to="body">
      <div v-if="showCreateModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
          <div class="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <h2 class="text-lg font-bold text-gray-900">Nova eOtpremnica</h2>
            <button @click="showCreateModal = false" class="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <div class="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
             <!-- Placeholder za formu -->
             <div class="grid grid-cols-2 gap-4">
                <div class="col-span-1 space-y-1">
                  <label class="text-xs font-bold text-gray-500 uppercase">Broj Dokumenta</label>
                  <input v-model="form.broj" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" placeholder="OTP-2026-001">
                </div>
                <div class="col-span-1 space-y-1">
                  <label class="text-xs font-bold text-gray-500 uppercase">PIB Kupca</label>
                  <input v-model="form.pibKupca" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" placeholder="105674049">
                </div>
             </div>

             <!-- Stavke -->
             <div class="space-y-3">
               <div class="flex justify-between items-center">
                 <h3 class="text-sm font-bold text-gray-900 uppercase tracking-tight">Stavke artikala</h3>
                 <button @click="addLine" class="text-xs text-blue-600 font-bold">+ Dodaj Artikal</button>
               </div>
               <div v-for="(line, idx) in form.lines" :key="idx" class="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
                 <div class="grid grid-cols-6 gap-3">
                    <div class="col-span-3"><input v-model="line.name" class="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm" placeholder="Naziv artikla"></div>
                    <div class="col-span-1"><input v-model.number="line.quantity" type="number" class="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm" placeholder="Kol."></div>
                    <div class="col-span-1"><input v-model="line.unitCode" class="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm" placeholder="H87"></div>
                    <div class="col-span-1 text-right"><button @click="removeLine(idx)" class="text-red-500">✕</button></div>
                 </div>
                 <!-- Akcizni blok -->
                 <div class="flex items-center gap-4 border-t border-gray-200 pt-3">
                    <select v-model="line.exciseCategory" class="text-xs border border-gray-300 rounded px-2 py-1 bg-white">
                      <option :value="undefined">Nije akcizna roba</option>
                      <option value="NAFTA">Naftni derivati</option>
                      <option value="ALKOHOL">Alkohol</option>
                    </select>
                    <input 
                      v-if="line.exciseCategory === 'NAFTA'"
                      v-model="line.itemProperties.GUSTINA" 
                      type="text" 
                      class="text-xs border border-gray-300 rounded px-2 py-1 w-24" 
                      placeholder="Gustina (npr. 0.840)"
                    >
                 </div>
               </div>
             </div>
          </div>
          <div class="p-6 border-t border-gray-100 bg-gray-50 flex justify-end space-x-3">
             <button @click="showCreateModal = false" class="px-4 py-2 text-gray-600 font-medium">Odustani</button>
             <button @click="submitDespatch" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold shadow-lg transition disabled:opacity-50" :disabled="submitting">
               {{ submitting ? 'Slanje...' : 'Pošalji na SEF' }}
             </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { useLogistics } from '~/composables/useLogistics'

const { fetchDocuments, sendDespatch } = useLogistics()

const filters = ref({ pib: '', status: '', page: 1 })
const showCreateModal = ref(false)
const submitting = ref(false)

const { data: documents, pending, refresh } = await fetchDocuments({ type: 'OTPREMNICA', ...filters.value })

const form = reactive({
  broj: '',
  pibKupca: '',
  issueDate: new Date().toISOString().split('T')[0],
  lines: [
    { id: '1', name: '', quantity: 0, unitCode: 'H87', exciseCategory: undefined, itemProperties: { GUSTINA: '' } }
  ]
})

const addLine = () => {
  form.lines.push({ id: (form.lines.length + 1).toString(), name: '', quantity: 0, unitCode: 'H87', exciseCategory: undefined, itemProperties: { GUSTINA: '' } })
}
const removeLine = (idx: number) => form.lines.splice(idx, 1)

const submitDespatch = async () => {
  submitting.value = true
  try {
    const res = await sendDespatch(form)
    showCreateModal.value = false
    refresh()
    alert('Otpremnica uspešno primljena i poslata u asinhronu obradu!')
  } catch (e: any) {
    alert('Greška pri slanju: ' + e.message)
  } finally {
    submitting.value = false
  }
}
</script>
