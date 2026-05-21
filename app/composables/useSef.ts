import { ref, computed } from 'vue'

export interface SefStats {
  stats: Array<{ status: string, broj: number }>;
  purchase_stats: Array<{ status: string, broj: number }>;
  health: number;
  environment: 'sandbox' | 'production';
  webhook_url?: string | null;
}

export interface SefLog {
  id: number;
  sef_id?: string | null;
  internal_id?: string | null;
  error_message: string;
  kreirano_u: string;
}

export interface SefFaktura {
  internal_id: string;
  sef_id: string | null;
  status: string;
  broj_fakture: string;
  iznos: number;
  error_message: string | null;
  azurirano_u: string;
}

export interface SefFaktureResponse {
  fakture: SefFaktura[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export const useSefAuth = () => {
  // Čuvanje klijent ID-a u cookie-ju radi perzistentnosti na klijentu
  const klijentId = useCookie('sef_klijent_id', {
    maxAge: 60 * 60 * 24 * 30, // 30 dana
    sameSite: 'lax'
  })

  const isAuthenticated = computed(() => !!klijentId.value)

  const login = (id: string) => {
    klijentId.value = id
  }

  const logout = () => {
    klijentId.value = null
    navigateTo('/')
  }

  return {
    klijentId,
    isAuthenticated,
    login,
    logout
  }
}

export const useSefApi = () => {
  const { klijentId } = useSefAuth()
  const config = useRuntimeConfig()
  
  // Univerzalni wrapper za zahteve sa ugrađenim zaglavljem
  const fetchWithAuth = (url: string, options: any = {}) => {
    return $fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'X-Klijent-ID': klijentId.value || ''
      }
    })
  }

  // ONBOARDING: Registracija klijenta
  const register = async (pib: string, naziv: string, sef_api_key: string) => {
    return await $fetch(`/api/register`, {
      method: 'POST',
      body: { pib, naziv, sef_api_key }
    })
  }

  // DASHBOARD: Dohvatanje statistike (reaktivno)
  const getStats = () => {
    return useFetch<SefStats>('/api/dashboard/stats', {
      headers: { 'X-Klijent-ID': klijentId.value || '' },
      key: `stats-${klijentId.value}`,
      server: false // Statistika se osvežava na klijentu
    })
  }

  // DASHBOARD: Dohvatanje logova grešaka
  const getLogs = () => {
    return useFetch<{ logs: SefLog[] }>('/api/dashboard/logs', {
      headers: { 'X-Klijent-ID': klijentId.value || '' },
      key: `logs-${klijentId.value}`,
      server: false
    })
  }

  // DASHBOARD: Dohvatanje liste faktura (paginirano)
  const getFakture = (page: Ref<number>) => {
    return useFetch<SefFaktureResponse>('/api/fakture', {
      query: { page },
      headers: { 'X-Klijent-ID': klijentId.value || '' },
      key: `fakture-${klijentId.value}`,
      watch: [page],
      server: false
    })
  }

  // AKCIJA: Ručna sinhronizacija
  const triggerSync = async () => {
    return await fetchWithAuth('/api/fakture/sync', { method: 'POST' })
  }

  // AKCIJA: Podešavanje Webhook-a
  const updateWebhook = async (webhook_url: string) => {
    return await fetchWithAuth('/api/dashboard/webhook', {
      method: 'POST',
      body: { webhook_url }
    })
  }

  return {
    register,
    getStats,
    getLogs,
    getFakture,
    triggerSync,
    updateWebhook
  }
}
