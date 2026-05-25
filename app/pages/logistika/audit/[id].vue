<template>
  <div class="space-y-12 pb-40">
    <div class="flex items-center justify-between">
       <h1 class="text-3xl font-black text-gray-900 tracking-tighter uppercase">Poreski Audit & Verifikacija Lanca</h1>
       <div class="flex gap-2">
          <button @click="downloadReport" class="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-black transition">Preuzmi Audit Izveštaj</button>
       </div>
    </div>

    <!-- Timeline Chart -->
    <div v-if="chainData" class="relative">
       <!-- Linija u pozadini -->
       <div class="absolute left-8 top-0 bottom-0 w-1 bg-gray-100 hidden md:block"></div>

       <div class="space-y-12">
          <div v-for="(doc, idx) in chainData.chain" :key="doc.id" class="relative flex flex-col md:flex-row items-start gap-8 group">
             <!-- Marker -->
             <div class="z-10 w-16 h-16 rounded-2xl bg-white border-4 border-gray-100 flex items-center justify-center text-2xl shadow-sm group-hover:border-blue-500 transition-colors">
                {{ typeIcon(doc.tip) }}
             </div>

             <!-- Card -->
             <div class="flex-1 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                <!-- Status Strip -->
                <div :class="['absolute left-0 top-0 bottom-0 w-1.5', statusColor(doc.status)]"></div>

                <div class="flex justify-between items-start">
                   <div>
                      <div class="flex items-center gap-3">
                         <span class="text-[10px] font-black uppercase px-2 py-0.5 bg-gray-100 rounded text-gray-500">{{ doc.tip }}</span>
                         <h4 class="font-bold text-gray-900 text-lg">{{ doc.broj }}</h4>
                      </div>
                      <p class="text-xs text-gray-400 mt-1 font-mono uppercase tracking-widest">Interni ID: {{ doc.id }}</p>
                   </div>
                   <LogistikaStatusBadge :status="doc.status" />
                </div>

                <div class="mt-6 flex items-center justify-between border-t border-gray-50 pt-4">
                   <div class="text-[11px] text-gray-500 font-medium italic">Kreirano: {{ new Date(doc.kreirano_u || '').toLocaleString() }}</div>
                   <div class="flex gap-4">
                      <button @click="viewXml(doc)" class="text-xs font-bold text-blue-600 hover:underline tracking-tight">🔎 Pregledaj XML</button>
                      <button @click="downloadXml(doc)" class="text-xs font-bold text-gray-600 hover:underline tracking-tight">⬇ Preuzmi UBL</button>
                   </div>
                </div>
             </div>
             
             <!-- Arrow Connector for MD+ -->
             <div v-if="idx < chainData.chain.length - 1" class="hidden md:block absolute left-8 top-16 h-12 w-1 border-l-2 border-dashed border-gray-300 ml-[-1px]"></div>
          </div>
       </div>
    </div>

    <!-- XML Modal Overlay -->
    <Teleport to="body">
      <div v-if="selectedXml" class="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-8 z-50">
         <div class="bg-[#1e1e1e] w-full max-w-5xl rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col h-[85vh]">
            <div class="px-8 py-6 border-b border-white/5 flex justify-between items-center bg-white/5">
               <div>
                  <h3 class="text-white font-black text-xl uppercase tracking-tighter">Originalni UBL XML Blob</h3>
                  <p class="text-gray-400 text-xs mt-1">Struktura usklađena sa MFIN RS v2.1 specifikacijom</p>
               </div>
               <button @click="selectedXml = null" class="text-gray-400 hover:text-white text-2xl transition">✕</button>
            </div>
            <div class="flex-1 overflow-auto p-8 font-mono text-sm leading-relaxed text-blue-300">
               <pre><code>{{ selectedXml }}</code></pre>
            </div>
            <div class="p-6 bg-black/40 border-t border-white/5 flex justify-end">
               <button @click="copyXml" class="text-white/60 hover:text-white text-xs font-bold mr-6">Kopiraj u Clipboard</button>
               <button @click="selectedXml = null" class="bg-blue-600 text-white px-8 py-3 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-blue-500 shadow-xl transition-all">Zatvori</button>
            </div>
         </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { useLogistics } from '~/composables/useLogistics'

const route = useRoute()
const { getDocumentChain } = useLogistics()

const { data: chainData } = await getDocumentChain(route.params.id as string)

const selectedXml = ref<string | null>(null)

const typeIcon = (tip: string) => {
  if (tip === 'OTPREMNICA') return '🚛'
  if (tip === 'PRIJEMNICA') return '📦'
  if (tip === '380') return '🧾'
  return '📄'
}

const statusColor = (status: string) => {
  if (status === 'SENT') return 'bg-green-500'
  if (status === 'DISCREPANCY') return 'bg-orange-500'
  if (status === 'ACCEPTED') return 'bg-emerald-500'
  return 'bg-gray-300'
}

const viewXml = (doc: any) => {
  selectedXml.value = doc.xmlBlob || '<?xml version="1.0" encoding="UTF-8"?>\n<ubl:NotAvailable>Prazan XML dokument</ubl:NotAvailable>'
}

const downloadXml = (doc: any) => {
  const blob = new Blob([doc.xmlBlob || ''], { type: 'application/xml' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${doc.broj}.xml`
  a.click()
}

const copyXml = () => {
  if (selectedXml.value) navigator.clipboard.writeText(selectedXml.value)
}

const downloadReport = () => {
  alert('Generisanje PDF audit paketa za inspekciju...')
}
</script>
