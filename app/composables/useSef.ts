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
  usage: {
    potroseno: number;
    limit: number;
    procenat: number;
    prikazi_brojac: boolean;
  };
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
  
  // Univerzalni wrapper za zahteve sa ugrađenim zaglavljem
  const fetchWithAuth = (url: string, options: any = {}) => {
    const headers = { ...options.headers }
    if (klijentId.value) {
      headers['X-Klijent-ID'] = klijentId.value
    }

    return $fetch(url, {
      ...options,
      headers
    })
  }

  // ONBOARDING: Aktivacija klijenta i kreiranje sesije
  const activate = async (pib: string, naziv: string, sef_api_key: string, plan: string = 'Micro', period: string = 'monthly', operater: string = 'Sistemski Operater') => {
    return await $fetch(`/api/auth/login`, {
      method: 'POST',
      body: { pib, naziv, api_key: sef_api_key, plan, billing_period: period, operater }
    })
  }

  // DASHBOARD: Dohvatanje statistike (reaktivno)
  const getStats = () => {
    const headers: Record<string, string> = {}
    if (klijentId.value) headers['X-Klijent-ID'] = klijentId.value

    return useFetch<SefStats>('/api/dashboard/stats', {
      headers,
      key: `stats-${klijentId.value || 'unauth'}`,
      server: false // Statistika se osvežava na klijentu
    })
  }

  // DASHBOARD: Dohvatanje logova grešaka
  const getLogs = () => {
    const headers: Record<string, string> = {}
    if (klijentId.value) headers['X-Klijent-ID'] = klijentId.value

    return useFetch<{ logs: SefLog[] }>('/api/dashboard/logs', {
      headers,
      key: `logs-${klijentId.value || 'unauth'}`,
      server: false
    })
  }

  // DASHBOARD: Dohvatanje liste faktura (paginirano)
  const getFakture = (page: Ref<number>) => {
    const headers: Record<string, string> = {}
    if (klijentId.value) headers['X-Klijent-ID'] = klijentId.value

    return useFetch<SefFaktureResponse>('/api/fakture', {
      query: { page },
      headers,
      key: `fakture-${klijentId.value || 'unauth'}`,
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

  // AKCIJA: Preuzimanje PPPDV TXT fajla za e-Poreze
  const downloadPppdvTxt = async (period: string) => {
    const res = await $fetch(`/api/analytics/pppdv-export?period=${period}`, {
      responseType: 'blob'
    })
    const url = window.URL.createObjectURL(new Blob([res as any]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `pppdv_${period}.txt`)
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return {
    activate,
    getStats,
    getLogs,
    getFakture,
    triggerSync,
    updateWebhook,
    cancelSubscription,
    downloadPppdvTxt
  }
}
