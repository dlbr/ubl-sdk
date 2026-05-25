//     this.baseUrl = 'https://demoppppdv.mfin.gov.rs/public-api';
import { type PopdvSubmitData } from '../types/popdv';

export interface PopdvClientConfig {
  baseUrl: string;
  token: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode: number;
}

/**
 * PopdvSefClient - Hardened client for the Serbian e-Porezi/POPDV API.
 * Protected against edge gateway hangs and malformed HTML responses.
 */
export class PopdvSefClient {
  private baseUrl: string;
  private token: string;

  constructor(config: PopdvClientConfig) {
    // ISPRAVLJENO: Koristimo prosleđeni baseUrl, a čistimo ga od pratećih koso-crtica
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.token = config.token;
  }

  /**
   * Pomoćna funkcija za fetch sa striktnim timeout oklopom za e-Porezi gateway.
   */
  private async fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 20000): Promise<Response> {
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
   * Pomoćna funkcija za bezbedno izvlačenje JSON-a bez rizika od rušenja niti usled HTML 502/504 odgovora.
   */
  private safelyParseJson(text: string): any | null {
    if (!text || !text.trim().startsWith('{') && !text.trim().startsWith('[')) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  /**
   * Korak 1: Slanje nacrta poreske prijave na državni portal
   */
  public async sendDraft(payload: PopdvSubmitData): Promise<ApiResponse<{ draftId: string; status: string; issues?: any[] }>> {
    const endpoint = `${this.baseUrl}/popdv/draft`;

    try {
      const response = await this.fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Base ${this.token}`, // Usklađeno sa zvaničnim e-Porezi ERP OAuth specifikacijama
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'SEF-Bridge-POPDV-Tank/2.0'
        },
        body: JSON.stringify(payload)
      }, 25000); // 25s za tešku sintaksnu kontrolu države

      const text = await response.text();
      const parsedJson = this.safelyParseJson(text);
      
      if (!response.ok) {
        const errorDetails = parsedJson?.Message || parsedJson?.message || text;
        return { 
          success: false, 
          error: `Državni API greška (Draft) Status [${response.status}]: ${errorDetails}`, 
          statusCode: response.status 
        };
      }

      if (!parsedJson) {
        return { success: false, error: "Državni API vratio nevalidan JSON format.", statusCode: 502 };
      }

      return { 
        success: true, 
        data: { 
          draftId: parsedJson.Id || parsedJson.draftId, 
          status: parsedJson.Status || parsedJson.status, 
          issues: parsedJson.ValidationIssues || parsedJson.issues || [] 
        }, 
        statusCode: response.status 
      };

    } catch (err: any) {
      return { 
        success: false, 
        error: err.name === 'AbortError'
          ? 'Mrežna greška: Državni portal e-Porezi nije odgovorio u bezbednom roku od 25 sekundi.'
          : `Mrežna greška (Draft Exception): ${err.message || err}`, 
        statusCode: 500 
      };
    }
  }

  /**
   * Korak 2: Konačna predaja i zaključavanje odobrenog nacrta
   */
  public async finalizeSubmission(draftId: string): Promise<ApiResponse<{ pppdvBroj: string; datumPrijema: string }>> {
    const endpoint = `${this.baseUrl}/popdv/submit`;

    try {
      const response = await this.fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Base ${this.token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'SEF-Bridge-POPDV-Tank/2.0'
        },
        body: JSON.stringify({ draftId })
      }, 20000); // 20s timeout za finalno zaključavanje

      const text = await response.text();
      const parsedJson = this.safelyParseJson(text);

      if (!response.ok) {
        const errorDetails = parsedJson?.Message || parsedJson?.message || text;
        return { 
          success: false, 
          error: `Državni API greška (Submit) Status [${response.status}]: ${errorDetails}`, 
          statusCode: response.status 
        };
      }

      if (!parsedJson) {
        return { success: false, error: "Državni API vratio nevalidan JSON format tokom finalizacije.", statusCode: 502 };
      }

      return { 
        success: true, 
        data: { 
          pppdvBroj: parsedJson.BrojPrijave || parsedJson.pppdvBroj, 
          datumPrijema: parsedJson.DatumPrijema || parsedJson.datumPrijema || new Date().toISOString() 
        }, 
        statusCode: response.status 
      };

    } catch (err: any) {
      return { 
        success: false, 
        error: err.name === 'AbortError'
          ? 'Mrežna greška: Finalizacija prekinuta usled odsustva odziva državnog portala (20s Timeout).'
          : `Mrežna greška (Submit Exception): ${err.message || err}`, 
        statusCode: 500 
      };
    }
  }
}