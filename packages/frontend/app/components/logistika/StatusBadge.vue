<template>
  <span 
    :class="[
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
      statusMap[status]?.class || 'bg-gray-100 text-gray-800 border-gray-200'
    ]"
  >
    <svg 
      v-if="status === 'PENDING_PROCESSING'" 
      class="animate-spin -ml-1 mr-1.5 h-3 w-3 text-blue-500" 
      fill="none" 
      viewBox="0 0 24 24"
    >
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    {{ statusMap[status]?.label || status }}
  </span>
</template>

<script setup lang="ts">
import type { LogisticsStatus } from '@sef/shared/types/logistics'

defineProps<{
  status: LogisticsStatus
}>()

const statusMap: Record<string, { label: string, class: string }> = {
  'PENDING_PROCESSING': { label: 'Obrada u toku', class: 'bg-blue-50 text-blue-700 border-blue-200' },
  'SENT': { label: 'Poslato na SEF', class: 'bg-green-50 text-green-700 border-green-200' },
  'ACCEPTED': { label: 'Prihvaćeno', class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  'DISCREPANCY': { label: 'Neslaganje', class: 'bg-orange-50 text-orange-700 border-orange-200' },
  'CONFIRMED': { label: 'Potvrđeno', class: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  'REJECTED': { label: 'Odbijeno', class: 'bg-red-50 text-red-700 border-red-200' },
  'TIMEOUT_DEADLOCK': { label: 'Greška mrežnog zastoja', class: 'bg-gray-100 text-gray-600 border-gray-300' }
}
</script>
