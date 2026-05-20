export interface SefClientConfig {
  apiKey: string;
  baseUrl: string; 
  environment: 'sandbox' | 'production';
}

export interface SefSendResponse {
  success: boolean;
  salesInvoiceId?: number;
  invoiceNumber?: string;
  error?: string;
  statusCode?: number;
}

export interface SefStatusResponse {
  InvoiceId: number;
  InvoiceStatus: string;
  SalesInvoiceId: number;
  InvoiceNumber: string;
  [key: string]: any;
}

export interface SefChangesResponse {
  invoices: any[];
  hasMoreCardInvoices: boolean;
}

/**
 * SefClient - High-fidelity client for Serbian SEF API v2/v3.
 * Hardened for Cloudflare Workers outbound routing.
 */
export class SefClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: SefClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || '').replace(/\/+$/, '');
  }

  /**
   * Pomoćna funkcija za postavljanje standardizovanih, neprobojnih zaglavlja za SEF.
   */
  private getHeaders(contentType = 'application/json'): Record<string, string> {
    return {
      'ApiKey': this.apiKey,
      'Content-Type': contentType,
      'Accept': contentType === 'application/xml' ? 'application/xml' : 'application/json',
      'User-Agent': 'SEF-Bridge-Edge-Tank/2.0 (Cloudflare Worker Runtime)',
      'Connection': 'keep-alive'
    };
  }

  /**
   * Pomoćna funkcija za fetch sa ugrađenim timeout-om (neophodno za SEF)
   */
  private async fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 15000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return response;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }

  /**
   * Sends generated UBL XML to SEF API.
   */
  async sendInvoice(xml: string, requestId: string): Promise<SefSendResponse> {
    const endpoint = `${this.baseUrl}/sales-invoice/ubl?requestId=${encodeURIComponent(requestId)}`;

    try {
      const response = await this.fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: this.getHeaders('application/xml'),
        body: xml
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorDetails = errorText;
        try {
          if (errorText.trim().startsWith('{')) {
            const errJson = JSON.parse(errorText);
            errorDetails = errJson.Message || errJson.message || errorText;
          }
        } catch {
          // Ostaje sirovi errorText
        }

        return {
          success: false,
          error: `SEF_API_ERROR (${response.status}): ${errorDetails}`,
          statusCode: response.status
        };
      }

      const data = await response.json() as { SalesInvoiceId: number; InvoiceNumber: string };

      return {
        success: true,
        salesInvoiceId: data.SalesInvoiceId,
        invoiceNumber: data.InvoiceNumber
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.name === 'AbortError'
          ? 'EDGE_FETCH_FAILURE: SEF API se nije odazvao u roku od 15 sekundi (Timeout).'
          : `EDGE_FETCH_FAILURE: ${error.message || error}`
      };
    }
  }

  /**
   * Checks the status of a specific invoice.
   */
  async getInvoiceStatus(salesInvoiceId: number): Promise<SefStatusResponse | null> {
    const endpoint = `${this.baseUrl}/sales-invoice/${salesInvoiceId}`;

    try {
      const response = await this.fetchWithTimeout(endpoint, {
        method: 'GET',
        headers: {
          'ApiKey': this.apiKey,
          'Accept': 'application/json',
          'User-Agent': 'SEF-Bridge-Edge-Tank/2.0'
        }
      }, 10000);

      if (!response.ok) return null;
      return await response.json() as SefStatusResponse;
    } catch (err) {
      console.error(`[SEF Mreža] Greška pri proveri statusa fakture ${salesInvoiceId}:`, err);
      return null;
    }
  }

  /**
   * Fetches purchase invoice changes for a given range (v3 endpoint).
   */
  async getPurchaseInvoiceChanges(dateFrom: string, dateTo: string, page: number = 1): Promise<SefChangesResponse | null> {
    const endpoint = `${this.baseUrl}/purchase-invoice/v3/changes?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}&page=${page}`;

    try {
      const response = await this.fetchWithTimeout(endpoint, {
        method: 'GET',
        headers: this.getHeaders()
      }, 20000);

      if (!response.ok) {
        console.error(`[SEF Mreža] Neuspešan poziv v3 promena (${response.status}):`, await response.text());
        return null;
      }

      const rawData = await response.json() as any;
      const normalizedInvoices = rawData.PurchaseInvoices || rawData.invoices || (Array.isArray(rawData) ? rawData : []);
      const hasMore = typeof rawData.HasMoreCardInvoices === 'boolean' ? rawData.HasMoreCardInvoices : false;

      return {
        invoices: normalizedInvoices,
        hasMoreCardInvoices: hasMore
      };
    } catch (err) {
      console.error('[SEF Mreža] Fatalna greška tokom povlačenja v3 promena:', err);
      return null;
    }
  }

  /**
   * Downloads the raw UBL XML for a specific purchase invoice.
   */
  async downloadPurchaseInvoiceXml(purchaseInvoiceId: number): Promise<string | null> {
    const endpoint = `${this.baseUrl}/purchase-invoice/xml?invoiceId=${purchaseInvoiceId}`;

    try {
      const response = await this.fetchWithTimeout(endpoint, {
        method: 'GET',
        headers: {
          'ApiKey': this.apiKey,
          'Accept': 'application/xml',
          'User-Agent': 'SEF-Bridge-Edge-Tank/2.0'
        }
      }, 15000);

      if (!response.ok) {
        console.error(`[SEF Mreža] Neuspešno preuzimanje XML-a za fakturu ${purchaseInvoiceId}. Status: ${response.status}`);
        return null;
      }
      return await response.text();
    } catch (err) {
      console.error(`[SEF Mreža] Izuzetak pri preuzimanju XML-a fakture ${purchaseInvoiceId}:`, err);
      return null;
    }
  }

  /**
   * Downloads the complete registry of companies from SEF Public API.
   * HARDENED FOR EDGE: Vraća sirovi CSV tekst umesto alokacije teških JSON objekata.
   */
  async downloadAllCompanies(): Promise<string | null> {
    // ISPRAVLJENO: Državni endpoint za download svih kompanija često zahteva direktnu javnu stazu
    // u zavisnosti od okruženja (koristi se /publicApi/downloadAllCompanies)
    const endpoint = `${this.baseUrl}/publicApi/downloadAllCompanies?includeAllStatuses=false`;

    try {
      const response = await this.fetchWithTimeout(endpoint, {
        method: 'GET',
        headers: {
          'ApiKey': this.apiKey,
          'Accept': 'text/csv, application/octet-stream',
          'User-Agent': 'SEF-Bridge-Edge-Tank/2.0'
        }
      }, 60000); // 60 sekundi je bezbedan limit za preuzimanje velikog CSV-a

      if (!response.ok) {
        console.error(`[SEF Mreža] Neuspešno preuzimanje registra kompanija. Status: ${response.status}`);
        return null;
      }
      
      // OKLOP: Vraćamo tekst (CSV) koji tvoj index.ts ruter već zna da strimuje liniju po liniju,
      // čime potrošnju memorije držimo zakucanu na minimalnih nekoliko megabajta.
      return await response.text();
    } catch (err) {
      console.error('[SEF Mreža] Fatalna greška pri preuzimanju centralnog registra kompanija:', err);
      return null;
    }
  }
}