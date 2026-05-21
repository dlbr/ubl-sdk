import { ref, computed } from 'vue'

export interface SefStats {
  stats: Array<{ status: string, broj: number }>;
  purchase_stats: Array<{ status: string, broj: number }>;
  health: number;
  environment: 'sandbox' | 'production';
  webhook_url?: string | null;
  klijent_id?: string;
  plan_name: string;
  billing_period: 'monthly' | 'annual';
  licenca_od_datuma?: string | null;
  licenca_istice_timestamp?: string | null;
  status_pretplate: 'AKTIVAN' | 'U_OTKAZNOM_ROKU' | 'BLOKIRAN';
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
  invoice_type_code: string;
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
  // OKLOP: Uklonjen plaintext kolačić. Identitet se sada čuva isključivo u šifrovanoj sesiji na serveru.
  const klijentId = ref<string | null>(null)

  // Inicijalizacija klijentId-a ako smo u browseru (nakon što statsData stigne)
  const login = (id: string) => {
    klijentId.value = id
  }

  const isAuthenticated = computed(() => {
    // Na klijentu, ako imamo klijentId ref, smatramo se ulogovanim
    // Backend će svakako uraditi finalnu proveru preko sealed session-a
    return !!klijentId.value
  })

  const logout = async () => {
    klijentId.value = null
    await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
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

  // ONBOARDING: Aktivacija klijenta i kreiranje sesije
  const activate = async (pib: string, naziv: string, sef_api_key: string, operater: string = 'Sistemski Operater') => {
    return await $fetch(`/api/auth/login`, {
      method: 'POST',
      body: { pib, naziv, api_key: sef_api_key, operater }
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

  // AKCIJA: Otkazivanje obnove pretplate
  const cancelSubscription = async () => {
    return await fetchWithAuth('/api/dashboard/cancel-subscription', { method: 'POST' })
  }

  return {
    activate,
    getStats,
    getLogs,
    getFakture,
    triggerSync,
    updateWebhook,
    cancelSubscription
  }
}
