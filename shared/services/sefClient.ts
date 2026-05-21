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
   * v3.8.0: Handles Base64 response from state servers.
   */
  async downloadPurchaseInvoiceXml(purchaseInvoiceId: number): Promise<string | null> {
    const endpoint = `${this.baseUrl}/purchase-invoice/xml?invoiceId=${purchaseInvoiceId}`;

    try {
      const response = await this.fetchWithTimeout(endpoint, {
        method: 'GET',
        headers: this.getHeaders('application/xml'),
      }, 15000);

      if (!response.ok) {
        console.error(`[SEF Mreža] Neuspešno preuzimanje XML-a za fakturu ${purchaseInvoiceId}. Status: ${response.status}`);
        return null;
      }

      const text = await response.text();
      // OKLOP: Ako odgovor počinje sa Base64 oznakom ili je JSON omotač
      if (text.trim().startsWith('{')) {
        const json = JSON.parse(text);
        if (json.Base64Xml) return atob(json.Base64Xml);
      }
      
      // Provera da li je ceo text zapravo Base64 (bez razmaka)
      if (text.length > 20 && !text.includes('<') && /^[A-Za-z0-9+/=]+$/.test(text.trim())) {
        return atob(text.trim());
      }

      return text;
    } catch (err) {
      console.error(`[SEF Mreža] Izuzetak pri preuzimanju XML-a fakture ${purchaseInvoiceId}:`, err);
      return null;
    }
  }

  /**
   * Downloads the signed UBL XML for a specific sales invoice.
   * v3.8.0: Required for legal archival.
   */
  async downloadSignedInvoice(salesInvoiceId: number): Promise<string | null> {
    const endpoint = `${this.baseUrl}/sales-invoice/signed-xml?invoiceId=${salesInvoiceId}`;

    try {
      const response = await this.fetchWithTimeout(endpoint, {
        method: 'GET',
        headers: this.getHeaders('application/xml'),
      }, 15000);

      if (!response.ok) return null;
      const text = await response.text();
      
      if (text.trim().startsWith('{')) {
        const json = JSON.parse(text);
        if (json.Base64Xml) return atob(json.Base64Xml);
      }
      
      if (text.length > 20 && !text.includes('<') && /^[A-Za-z0-9+/=]+$/.test(text.trim())) {
        return atob(text.trim());
      }
      
      return text;
    } catch (err) {
      return null;
    }
  }

  /**
   * Downloads the complete registry of companies from SEF Public API.
   * HARDENED FOR EDGE: Requests CSV for low memory footprint.
   */
  async downloadAllCompanies(): Promise<string | null> {
    // Koristimo getAllCompanies koji je po preporuci korisnika stabilniji
    const endpoint = `${this.baseUrl}/publicApi/getAllCompanies?includeAllStatuses=false`;

    try {
      const response = await this.fetchWithTimeout(endpoint, {
        method: 'GET',
        headers: {
          'ApiKey': this.apiKey,
          'Accept': 'text/csv, application/csv, text/plain',
          'User-Agent': 'SEF-Bridge-Edge-Tank/2.0'
        }
      }, 60000);

      if (!response.ok) {
        console.error(`[SEF Mreža] Neuspešno preuzimanje registra kompanija. Status: ${response.status}`);
        return null;
      }
      
      const contentType = response.headers.get('content-type') || '';
      let text = await response.text();

      // OKLOP: Uklanjamo Byte Order Mark (BOM) ako postoji (čest slučaj kod državnih CSV-ova)
      if (text.charCodeAt(0) === 0xFEFF) {
        text = text.slice(1);
      }

      if (contentType.includes('json')) {
        // Ako država odbije CSV i pošalje JSON, moramo ga konvertovati u naš interni CSV format
        // kako bismo zadržali kompatibilnost sa striming parserom u index.ts
        try {
          const json = JSON.parse(text) as any[];
          if (Array.isArray(json)) {
             const header = 'VatRegistrationCode,RegistrationCode,Name,Status';
             const lines = json.map(c => {
               const pib = String(c.VatRegistrationCode || c.pib || '').replace(/"/g, '');
               const mb = String(c.RegistrationCode || c.maticniBroj || '').replace(/"/g, '');
               const name = String(c.Name || c.naziv || '').replace(/"/g, ' ');
               const status = String(c.Status || 'Active').replace(/"/g, '');
               return `"${pib}","${mb}","${name}","${status}"`;
             });
             return [header, ...lines].join('\n');
          }
        } catch (jsonErr) {
          console.error('[SEF Mreža] Neuspela konverzija JSON registra u CSV:', jsonErr);
        }
      }

      return text;
    } catch (err) {
      console.error('[SEF Mreža] Fatalna greška pri preuzimanju centralnog registra kompanija:', err);
      return null;
    }
  }

  /**
   * Fetches official unit measures from SEF Public API.
   */
  async getUnitMeasures(): Promise<string[] | null> {
    const endpoint = `${this.baseUrl}/publicApi/get-unit-measures`;
    try {
      const response = await this.fetchWithTimeout(endpoint, {
        method: 'GET',
        headers: this.getHeaders()
      });
      if (!response.ok) return null;
      const data = await response.json() as Array<{ Code: string }>;
      return data.map(m => m.Code);
    } catch (err) {
      console.error('[SEF Mreža] Greška pri povlačenju jedinica mera:', err);
      return null;
    }
  }
}