<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <h1 class="text-2xl font-bold text-gray-900">Izlazne prijemnice (Nabavka)</h1>
      <button 
        @click="showCreateModal = true"
        class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition shadow-sm flex items-center"
      >
        <span class="mr-2">+</span> Nova Prijemnica
      </button>
    </div>

    <!-- Tabela prijemnica -->
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50 text-gray-500 uppercase text-[11px] font-bold tracking-wider">
          <tr>
            <th class="px-6 py-3 text-left">Broj prijemnice</th>
            <th class="px-6 py-3 text-left">Ref. Otpremnica</th>
            <th class="px-6 py-3 text-left">Dobavljač</th>
            <th class="px-6 py-3 text-left">Status</th>
            <th class="px-6 py-3 text-right">Akcije</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 text-sm text-gray-700">
          <tr v-for="doc in documents" :key="doc.id" class="hover:bg-gray-50 transition">
            <td class="px-6 py-4 font-mono font-medium">{{ doc.broj }}</td>
            <td class="px-6 py-4 text-gray-400">{{ doc.parentId || 'N/A' }}</td>
            <td class="px-6 py-4">{{ doc.pibProdavca }}</td>
            <td class="px-6 py-4">
              <LogistikaStatusBadge :status="doc.status" />
            </td>
            <td class="px-6 py-4 text-right">
              <NuxtLink :to="`/logistika/audit/${doc.id}`" class="text-blue-600 hover:text-blue-800 font-medium">Audit lanca</NuxtLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal za novu prijemnicu (Forenzička forma) -->
    <Teleport to="body">
      <div v-if="showCreateModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in duration-200">
          <div class="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <h2 class="text-lg font-bold text-gray-900">Potvrda Prijema (Prijemnica)</h2>
            <button @click="showCreateModal = false" class="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          
          <div class="p-6 grid grid-cols-3 gap-6 max-h-[80vh] overflow-y-auto">
            <!-- Header forme -->
            <div class="col-span-3 grid grid-cols-3 gap-4">
               <div class="space-y-1">
                  <label class="text-xs font-bold text-gray-500 uppercase">Broj Prijemnice</label>
                  <input v-model="form.id" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500" placeholder="REC-2026-001">
               </div>
               <div class="space-y-1">
                  <label class="text-xs font-bold text-gray-500 uppercase">Ref. Otpremnica (ID)</label>
                  <input v-model="form.despatchReference.id" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500" placeholder="OTP-XYZ-123">
               </div>
               <div class="space-y-1">
                  <label class="text-xs font-bold text-gray-500 uppercase">PIB Dobavljača</label>
                  <input v-model="form.supplierPib" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500" placeholder="111222333">
               </div>
            </div>

            <!-- Stavke sa kalkulacijom razlike -->
            <div class="col-span-3">
               <div class="flex justify-between items-center mb-3">
                 <h3 class="text-sm font-bold text-gray-900 uppercase">Kvantitativna Verifikacija Robe</h3>
                 <button @click="addLine" class="text-xs text-emerald-600 font-bold">+ Dodaj stavku</button>
               </div>
               <div class="space-y-2">
                 <div v-for="(line, idx) in form.lines" :key="idx" 
                   :class="['p-4 rounded-xl border transition-colors', (line.shortQuantity || 0) > 0 ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-200']"
                 >
                    <div class="grid grid-cols-12 gap-3 items-end">
                       <div class="col-span-4">
                          <label class="text-[10px] font-bold text-gray-400 uppercase">Artikal</label>
                          <input v-model="line.itemName" class="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white" placeholder="Naziv">
                       </div>
                       <div class="col-span-2">
                          <label class="text-[10px] font-bold text-gray-400 uppercase">Primljeno</label>
                          <input v-model.number="line.receivedQuantity" type="number" class="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white">
                       </div>
                       <div class="col-span-2">
                          <label class="text-[10px] font-bold text-gray-400 uppercase">Manjak</label>
                          <input v-model.number="line.shortQuantity" type="number" class="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white">
                       </div>
                       <div class="col-span-3">
                          <label class="text-[10px] font-bold text-gray-400 uppercase">Razlog odbijanja</label>
                          <input v-model="line.rejectReason" class="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white" placeholder="Npr. Oštećeno">
                       </div>
                       <div class="col-span-1 text-right">
                          <button @click="removeLine(idx)" class="text-red-400 hover:text-red-600 mb-1">✕</button>
                       </div>
                    </div>
                    <!-- Akcizni blok za prijem -->
                    <div v-if="line.exciseCategory === 'NAFTA'" class="mt-3 pt-3 border-t border-dashed border-gray-300 flex gap-4">
                       <div class="flex items-center gap-2">
                          <span class="text-[10px] font-bold text-gray-500 uppercase italic">Verifikacija Gustine:</span>
                          <input v-model="line.itemProperties.GUSTINA" type="text" class="text-xs border border-orange-300 rounded px-2 py-1 w-24 bg-white" placeholder="0.835">
                       </div>
                    </div>
                 </div>
               </div>
            </div>
          </div>

          <div class="p-6 border-t border-gray-100 bg-gray-50 flex justify-end items-center space-x-4">
             <div v-if="totalDiscrepancy > 0" class="text-orange-600 text-sm font-bold animate-pulse">
               ⚠ Detektovano neslaganje u {{ totalDiscrepancy }} stavki
             </div>
             <button @click="showCreateModal = false" class="px-4 py-2 text-gray-600 font-medium">Odustani</button>
             <button @click="submitReceipt" class="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-2 rounded-lg font-bold shadow-lg transition disabled:opacity-50" :disabled="submitting">
               {{ submitting ? 'Obrada...' : 'Završi Prijem' }}
             </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { useLogistics } from '~/composables/useLogistics'

const { fetchDocuments, sendReceipt } = useLogistics()

const showCreateModal = ref(false)
const submitting = ref(false)

const { data: documents, refresh } = await fetchDocuments({ type: 'PRIJEMNICA' })

const form = reactive({
  id: '',
  issueDate: new Date().toISOString().split('T')[0],
  supplierPib: '',
  customerPib: '113398540',
  despatchReference: { id: '', issueDate: '' },
  lines: [
    { id: '1', itemName: '', receivedQuantity: 0, shortQuantity: 0, unitCode: 'H87', despatchLineId: '1', exciseCategory: undefined, itemProperties: { GUSTINA: '' } }
  ]
})

const totalDiscrepancy = computed(() => form.lines.filter(l => (l.shortQuantity || 0) > 0).length)

const addLine = () => {
  form.lines.push({ id: (form.lines.length + 1).toString(), itemName: '', receivedQuantity: 0, shortQuantity: 0, unitCode: 'H87', despatchLineId: (form.lines.length + 1).toString(), exciseCategory: undefined, itemProperties: { GUSTINA: '' } })
}
const removeLine = (idx: number) => form.lines.splice(idx, 1)

const submitReceipt = async () => {
  submitting.value = true
  try {
    await sendReceipt(form)
    showCreateModal.value = false
    refresh()
    alert('Prijemnica uspešno generisana!')
  } catch (e: any) {
    alert('Greška: ' + e.message)
  } finally {
    submitting.value = false
  }
}
</script>
