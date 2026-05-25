import type { 
  LogisticsDocument, 
  ReconciliationDashboard, 
  LogisticsDocumentType 
} from '@sef/shared/types/logistics'

export const useLogistics = () => {
  const config = useRuntimeConfig()
  
  // 1. Fetching Documents with Pagination & Filters
  const fetchDocuments = async (params: { 
    type: LogisticsDocumentType, 
    status?: string, 
    pib?: string, 
    page?: number 
  }) => {
    return await useFetch<LogisticsDocument[]>('/api/logistika/documents', {
      params,
      key: `docs-${params.type}-${params.status}-${params.page}`
    })
  }

  // 2. Submit New Despatch (Otpremnica)
  const sendDespatch = async (payload: Partial<LogisticsDocument>) => {
    return await $fetch('/api/otpremnice/send', {
      method: 'POST',
      body: payload
    })
  }

  // 3. Submit New Receipt (Prijemnica)
  const sendReceipt = async (payload: Partial<LogisticsDocument>) => {
    return await $fetch('/api/prijemnice/receive', {
      method: 'POST',
      body: payload
    })
  }

  // 4. Deep Forensic Reconciliation
  const getReconciliation = async (id: string) => {
    return await useFetch<ReconciliationDashboard>(`/api/otpremnice/reconciliation/${id}`, {
      key: `recon-${id}`
    })
  }

  // 5. Chain Audit (Recursive CTE)
  const getDocumentChain = async (id: string) => {
    return await useFetch<{ success: boolean, chain: LogisticsDocument[] }>(`/api/dokumenti/chain/${id}`, {
      key: `chain-${id}`
    })
  }

  return {
    fetchDocuments,
    sendDespatch,
    sendReceipt,
    getReconciliation,
    getDocumentChain
  }
}
