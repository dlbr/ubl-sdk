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
 * SefClient - High-fidelity client for Serbian SEF API v1.
 * Hardened for Cloudflare Workers outbound routing.
 */
export class SefClient {
  private apiKey: string;
  private baseUrl: string;
  private static isCircuitOpen = false;
  private static circuitOpenUntil = 0;

  constructor(config: SefClientConfig) {
    this.apiKey = config.apiKey;
    
    if (!config.baseUrl) {
      throw new Error(`Kritična greška: SEF_API_URL (baseUrl) nije definisan.`);
    }

    let url = config.baseUrl.trim().replace(/\/$/, "");
    
    // OKLOP: Sprečavamo dupli /api sufiks
    if (url.endsWith("/api")) {
      url = url.substring(0, url.length - 4);
    }
    this.baseUrl = url;
    console.log(`[SefClient] Inicijalizovan API URL: ${this.baseUrl}`);
  }

  static getCircuitStatus(): { isOpen: boolean, openUntil?: string } {
    if (!SefClient.isCircuitOpen) return { isOpen: false };
    if (Date.now() > SefClient.circuitOpenUntil) {
      SefClient.isCircuitOpen = false;
      return { isOpen: false };
    }
    return { 
      isOpen: true, 
      openUntil: new Date(SefClient.circuitOpenUntil).toISOString() 
    };
  }

  private checkCircuit() {
    if (SefClient.isCircuitOpen) {
      if (Date.now() > SefClient.circuitOpenUntil) {
        SefClient.isCircuitOpen = false;
        return;
      }
      throw new Error('Circuit Breaker: SEF je trenutno offline ili u prekidu. Pokušaj kasnije.');
    }
  }

  private openCircuit(durationMs = 60000) {
    SefClient.isCircuitOpen = true;
    SefClient.circuitOpenUntil = Date.now() + durationMs;
    console.error(`[SefClient] Circuit Breaker AKTIVIRAN na ${durationMs/1000}s zbog serverske greške.`);
  }

  /**
   * Pomoćna funkcija za postavljanje standardizovanih, neprobojnih zaglavlja za SEF.
   * v4.15.1: Dodati browser-like headeri za izbegavanje "Security through Obscurity" filtera.
   */
  private getHeaders(contentType = 'application/json'): Record<string, string> {
    return {
      'ApiKey': this.apiKey,
      'Content-Type': contentType,
      'Accept': 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 (SEF-Bridge-Forensic)',
      'Connection': 'keep-alive'
    };
  }

  /**
   * Pomoćna funkcija za fetch sa ugrađenim timeout-om (neophodno za SEF)
   */
  private async fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 15000): Promise<Response> {
    this.checkCircuit();
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);

      if (response.status === 500 || response.status === 503) {
        this.openCircuit();
      }

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
    const endpoint = `${this.baseUrl}/api/publicApi/sales-invoice/ubl?requestId=${encodeURIComponent(requestId)}`;

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
   * Checks the status of a specific invoice (v1 endpoint).
   */
  async getInvoiceStatus(salesInvoiceId: number): Promise<SefStatusResponse | null> {
    return this.getSalesInvoiceDetails(salesInvoiceId);
  }

  /**
   * Fetches sales invoice IDs for a given range (v1 endpoint).
   */
  async getSalesInvoiceIds(dateFrom: string, dateTo: string, status?: string): Promise<number[] | null> {
    let endpoint = `${this.baseUrl}/api/publicApi/sales-invoice/ids?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`;
    if (status) {
      endpoint += `&status=${encodeURIComponent(status)}`;
    }

    try {
      console.log(`[SEF Mreža] Pozivam sales/ids: ${endpoint}`);
      const response = await this.fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: this.getHeaders()
      }, 20000);

      if (!response.ok) {
        console.error(`[SEF Mreža] Neuspešan poziv sales/ids (${response.status}):`, await response.text());
        return null;
      }

      const data = await response.json() as { salesInvoiceIds: number[] };
      const ids = data.salesInvoiceIds || [];
      console.log(`[SEF Mreža] Pronađeno ${ids.length} sales IDs.`);
      return ids;
    } catch (err) {
      console.error('[SEF Mreža] Fatalna greška tokom povlačenja sales IDs:', err);
      return null;
    }
  }

  /**
   * Downloads the raw UBL XML for a specific sales invoice (v1 endpoint).
   */
  async downloadSalesInvoiceXml(salesInvoiceId: number): Promise<string | null> {
    const endpoint = `${this.baseUrl}/api/publicApi/sales-invoice/xml?invoiceId=${salesInvoiceId}`;

    try {
      const response = await this.fetchWithTimeout(endpoint, {
        method: 'GET',
        headers: this.getHeaders('application/xml'),
      }, 15000);

      if (!response.ok) {
        console.error(`[SEF Mreža] Neuspešno preuzimanje sales XML-a za fakturu ${salesInvoiceId}. Status: ${response.status}`);
        return null;
      }

      const text = await response.text();
      // OKLOP: v1 XML endpoint obično vraća direktan XML ili Base64 u JSON-u
      if (text.trim().startsWith('{')) {
        const json = JSON.parse(text);
        if (json.Base64Xml) return atob(json.Base64Xml);
        if (json.Xml) return json.Xml;
      }
      
      if (text.length > 20 && !text.includes('<') && /^[A-Za-z0-9+/=]+$/.test(text.trim())) {
        return atob(text.trim());
      }

      return text;
    } catch (err) {
      console.error(`[SEF Mreža] Izuzetak pri preuzimanju sales XML-a fakture ${salesInvoiceId}:`, err);
      return null;
    }
  }

  /**
   * Checks the details of a specific sales invoice (v1 endpoint).
   */
  async getSalesInvoiceDetails(salesInvoiceId: number): Promise<SefStatusResponse | null> {
    const endpoint = `${this.baseUrl}/api/publicApi/sales-invoice?invoiceId=${salesInvoiceId}`;

    try {
      const response = await this.fetchWithTimeout(endpoint, {
        method: 'GET',
        headers: this.getHeaders()
      }, 10000);

      if (!response.ok) return null;
      const data = await response.json() as any;
      // Mapiramo SimpleSalesInvoiceDto na naš interni format
      return {
        InvoiceId: data.invoiceId,
        InvoiceNumber: data.invoiceNumber,
        InvoiceStatus: data.status || data.invoiceStatus,
        SalesInvoiceId: data.invoiceId,
        TotalAmount: data.totalAmount || 0
      };
    } catch (err) {
      console.error(`[SEF Mreža] Greška pri preuzimanju detalja fakture ${salesInvoiceId}:`, err);
      return null;
    }
  }

  /**
   * Fetches purchase invoice overview for a given range (v1 endpoint).
   */
  async getPurchaseInvoiceOverview(dateFrom: string, dateTo: string, status: string = ''): Promise<any[] | null> {
    const endpoint = `${this.baseUrl}/api/publicApi/purchase-invoice/overview?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}&status=${encodeURIComponent(status)}`;

    try {
      const response = await this.fetchWithTimeout(endpoint, {
        method: 'GET',
        headers: this.getHeaders()
      }, 20000);

      if (!response.ok) {
        console.error(`[SEF Mreža] Neuspešan poziv purchase/overview (${response.status}):`, await response.text());
        return null;
      }

      return await response.json() as any[];
    } catch (err) {
      console.error('[SEF Mreža] Fatalna greška tokom povlačenja purchase overview:', err);
      return null;
    }
  }

  /**
   * Fetches sales invoice changes (POST as per v1 swagger, but using v3 path if available).
   */
  async getSalesInvoiceChanges(dateFrom: string, dateTo: string, page: number = 1): Promise<SefChangesResponse | null> {
    const endpoint = `${this.baseUrl}/api/publicApi/sales-invoice/v3/changes?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}&page=${page}`;

    try {
      console.log(`[SEF Mreža] Pozivam sales/v3/changes (POST): ${endpoint}`);
      const response = await this.fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: this.getHeaders()
      }, 20000);

      if (!response.ok) {
        console.error(`[SEF Mreža] Neuspešan poziv v3 sales/changes (${response.status}):`, await response.text());
        return null;
      }

      const rawData = await response.json() as any;
      const normalizedInvoices = rawData.SalesInvoices || rawData.invoices || (Array.isArray(rawData) ? rawData : []);
      const hasMore = typeof rawData.HasMoreCardInvoices === 'boolean' ? rawData.HasMoreCardInvoices : false;

      return {
        invoices: normalizedInvoices,
        hasMoreCardInvoices: hasMore
      };
    } catch (err) {
      console.error('[SEF Mreža] Fatalna greška tokom povlačenja v3 sales promena:', err);
      return null;
    }
  }

  /**
   * Fetches purchase invoice changes (POST as per v1 swagger).
   */
  async getPurchaseInvoiceChanges(dateFrom: string, dateTo: string, page: number = 1): Promise<SefChangesResponse | null> {
    const endpoint = `${this.baseUrl}/api/publicApi/purchase-invoice/v3/changes?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}&page=${page}`;

    try {
      console.log(`[SEF Mreža] Pozivam purchase/v3/changes (POST): ${endpoint}`);
      const response = await this.fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: this.getHeaders()
      }, 20000);

      if (!response.ok) {
        console.error(`[SEF Mreža] Neuspešan poziv v3 purchase/changes (${response.status}):`, await response.text());
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
      console.error('[SEF Mreža] Fatalna greška tokom povlačenja v3 purchase promena:', err);
      return null;
    }
  }

  /**
   * Fetches sales invoice overview (ids + basic info) for a given range.
   */
  async getSalesInvoiceOverview(dateFrom: string, dateTo: string, status: string = ''): Promise<any[] | null> {
    // Ako v1 nema overview za sales, koristimo IDS pa detalje, ali ovde dodajemo wrapper
    const ids = await this.getSalesInvoiceIds(dateFrom, dateTo, status);
    if (!ids) return null;
    return ids.map(id => ({ invoiceId: id }));
  }

  /**
   * Downloads the raw UBL XML for a specific purchase invoice.
   * v3.8.0: Handles Base64 response from state servers.
   */
  async downloadPurchaseInvoiceXml(purchaseInvoiceId: number): Promise<string | null> {
    const endpoint = `${this.baseUrl}/api/publicApi/purchase-invoice/xml?invoiceId=${purchaseInvoiceId}`;

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
    const endpoint = `${this.baseUrl}/api/publicApi/sales-invoice/signed-xml?invoiceId=${salesInvoiceId}`;

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
    const endpoint = `${this.baseUrl}/api/publicApi/getAllCompanies?includeAllStatuses=false`;

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
    const endpoint = `${this.baseUrl}/api/publicApi/get-unit-measures`;
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
