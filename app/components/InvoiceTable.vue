<script setup lang="ts">
const props = defineProps<{
  page?: number
}>()

const { getFakture } = useSefApi()
const currentPage = ref(props.page || 1)

const { data, pending, refresh } = await getFakture(currentPage)

const getStatusClass = (status: string) => {
  switch (status) {
    case 'Sent': return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'Approved': return 'bg-green-100 text-green-700 border-green-200'
    case 'Rejected': return 'bg-red-100 text-red-700 border-red-200'
    case 'Queued': return 'bg-gray-100 text-gray-700 border-gray-200'
    case 'Failed': return 'bg-orange-100 text-orange-700 border-orange-200'
    default: return 'bg-gray-50 text-gray-600 border-gray-100'
  }
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('sr-RS', { style: 'currency', currency: 'RSD' }).format(amount)
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('sr-RS')
}

watch(currentPage, () => {
  refresh()
})

defineExpose({ refresh })
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-between items-center px-1">
      <h2 class="text-lg font-bold text-gray-900">Sve Fakture</h2>
      <button @click="() => refresh()" class="text-sm text-blue-600 font-medium hover:underline">Osveži listu</button>
    </div>

    <div class="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              <th class="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Broj Fakture</th>
              <th class="px-6 py-3 text-xs font-semibold text-gray-500 uppercase text-right">Iznos</th>
              <th class="px-6 py-3 text-xs font-semibold text-gray-500 uppercase text-center">Status</th>
              <th class="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Ažurirano</th>
              <th class="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">SEF ID</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-if="pending" v-for="i in 5" :key="i">
              <td colspan="5" class="px-6 py-4 h-12 bg-gray-50/30 animate-pulse"></td>
            </tr>
            <tr v-else-if="!data?.fakture?.length">
              <td colspan="5" class="px-6 py-12 text-center text-gray-400 italic">Nema pronađenih faktura.</td>
            </tr>
            <tr v-for="f in data?.fakture" :key="f.internal_id" class="hover:bg-gray-50 transition group">
              <td class="px-6 py-4 font-medium text-gray-900">{{ f.broj_fakture }}</td>
              <td class="px-6 py-4 text-right font-mono text-sm">{{ formatCurrency(f.iznos) }}</td>
              <td class="px-6 py-4 text-center">
                <span :class="getStatusClass(f.status)" class="px-2 py-1 rounded-md text-[10px] font-bold uppercase border">
                  {{ f.status }}
                </span>
                <p v-if="f.error_message" class="text-[10px] text-red-500 mt-1 max-w-[150px] truncate mx-auto" :title="f.error_message">
                  {{ f.error_message }}
                </p>
              </td>
              <td class="px-6 py-4 text-xs text-gray-500">{{ formatDate(f.azurirano_u) }}</td>
              <td class="px-6 py-4 font-mono text-xs text-blue-500 group-hover:text-blue-700">{{ f.sef_id || '---' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div v-if="data?.pagination && data.pagination.totalPages > 1" class="bg-gray-50 px-6 py-3 border-t border-gray-200 flex justify-between items-center">
        <span class="text-xs text-gray-500">Stranica {{ data.pagination.page }} od {{ data.pagination.totalPages }}</span>
        <div class="flex gap-2">
          <button 
            :disabled="currentPage <= 1"
            @click="currentPage--"
            class="px-3 py-1 border border-gray-300 rounded text-xs font-medium bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            Prethodna
          </button>
          <button 
            :disabled="currentPage >= data.pagination.totalPages"
            @click="currentPage++"
            class="px-3 py-1 border border-gray-300 rounded text-xs font-medium bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            Sledeća
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
