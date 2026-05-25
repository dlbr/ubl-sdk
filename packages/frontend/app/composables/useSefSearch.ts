import { ref, watch } from 'vue'

export const useSefSearch = () => {
  const config = useRuntimeConfig()
  
  const query = ref('')
  const results = ref<Array<{ pib: string; maticni_broj: string; naziv_firme: string }>>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  
  let debounceTimeout: any

  const executeSearch = async (searchQuery: string) => {
    const trimmed = searchQuery.trim()
    if (trimmed.length < 3) {
      results.value = []
      return
    }

    isLoading.value = true
    error.value = null

    try {
      const data = await $fetch(`/api/onboarding/search?q=${encodeURIComponent(trimmed)}`) as any
      
      if (data.uspeh) {
        results.value = data.rezultati
      } else {
        error.value = data.greska || 'Greška prilikom pretrage'
      }
    } catch (err: any) {
      error.value = err.message || 'Sistemska greška'
    } finally {
      isLoading.value = false
    }
  }

  watch(query, (newQuery: string) => {
    if (debounceTimeout) clearTimeout(debounceTimeout)
    debounceTimeout = setTimeout(() => {
      executeSearch(newQuery)
    }, 300)
  })

  return {
    query,
    results,
    isLoading,
    error
  }
}
