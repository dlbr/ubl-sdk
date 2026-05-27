import { XMLParser } from 'fast-xml-parser';

export interface NbsEnv {
  NBS_USERNAME: string;
  NBS_PASSWORD: string;
  NBS_LICENCE_ID: string;
  REGISTAR_DB: any;
}

export type ExchangeRateListType = 1 | 2 | 3 | 4; // 1: Middle Rate, 2: Buying/Selling, etc.

export class NbsSoapService {
  private static memoryCache = new Map<string, any>();
  private static parser = new XMLParser({
    ignoreAttributes: true,
    removeNSPrefix: true
  });

  private static readonly ENDPOINTS = {
    EXCHANGE_RATE: 'https://webservices.nbs.rs/CommunicationOfficeService1_0/ExchangeRateService.asmx',
    EXCHANGE_RATE_XML: 'https://webservices.nbs.rs/CommunicationOfficeService1_0/ExchangeRateXmlService.asmx',
    CURRENT_EXCHANGE_RATE_XML: 'https://webservices.nbs.rs/CommunicationOfficeService1_0/CurrentExchangeRateXmlService.asmx',
    CORE: 'https://webservices.nbs.rs/CommunicationOfficeService1_0/CoreService.asmx',
    CORE_XML: 'https://webservices.nbs.rs/CommunicationOfficeService1_0/CoreXmlService.asmx',
    FORCED_COLLECTION: 'https://webservices.nbs.rs/CommunicationOfficeService1_0/ForcedCollectionService.asmx',
    FORCED_COLLECTION_XML: 'https://webservices.nbs.rs/CommunicationOfficeService1_0/ForcedCollectionXmlService.asmx',
    FINANCIAL_MARKET_XML: 'https://webservices.nbs.rs/CommunicationOfficeService1_0/FinancialMarketXmlService.asmx',
    INSURANCE_XML: 'https://webservices.nbs.rs/CommunicationOfficeService1_0/InsuranceXmlService.asmx',
    // Legacy/Alternative used in current code
    RATE_SERVICE: 'https://www.nbs.rs/communicationoffice/ExchangeRateRateService.asmx'
  };

  private static async callSoap(
    endpoint: string,
    methodName: string,
    params: Record<string, any>,
    env: NbsEnv
  ): Promise<any> {
    const paramXml = Object.entries(params)
      .map(([key, val]) => `<${key}>${val}</${key}>`)
      .join('');

    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <AuthenticationHeader xmlns="http://communicationoffice.nbs.rs">
      <UserName>${env.NBS_USERNAME}</UserName>
      <Password>${env.NBS_PASSWORD}</Password>
      <LicenceID>${env.NBS_LICENCE_ID}</LicenceID>
    </AuthenticationHeader>
  </soap:Header>
  <soap:Body>
    <${methodName} xmlns="http://communicationoffice.nbs.rs">
      ${paramXml}
    </${methodName}>
  </soap:Body>
</soap:Envelope>`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': `"http://communicationoffice.nbs.rs/${methodName}"`
      },
      body: soapEnvelope
    });

    if (!response.ok) throw new Error(`NBS_HTTP_${response.status}`);

    const xmlText = await response.text();
    const jsonObj = this.parser.parse(xmlText);
    const result = jsonObj?.Envelope?.Body?.[`${methodName}Response`]?.[`${methodName}Result`];

    if (result === undefined) {
      console.error('NBS Response Error:', xmlText);
      throw new Error(`NBS_PARSING_ERROR`);
    }

    return result;
  }

  /**
   * Postoji u originalnom kodu, zadržavamo kompatibilnost i specifičan keš/fallback.
   */
  static async getMiddleRate(
    currency: 'EUR' | 'USD' | 'CHF', 
    dateStr: string,
    env: NbsEnv
  ): Promise<number> {
    if ((currency as string) === 'RSD') return 1.0;

    const cacheKey = `rate_${currency}_${dateStr}`;
    if (this.memoryCache.has(cacheKey)) {
      return this.memoryCache.get(cacheKey);
    }

    try {
      const dbRow = await env.REGISTAR_DB.prepare(`
        SELECT kurs FROM nbs_kursna_lista_cache 
        WHERE valuta = ? AND datum = ?
      `).bind(currency, dateStr).first<{ kurs: number }>();

      if (dbRow && dbRow.kurs) {
        this.memoryCache.set(cacheKey, dbRow.kurs);
        return dbRow.kurs;
      }
    } catch (dbError) {
      console.error(`🚨 [NBS-CACHE-DB] Neuspešno čitanje keša iz baze:`, dbError);
    }

    const formattedDate = dateStr.replace(/-/g, ''); 
    
    try {
      const rateResult = await this.callSoap(
        this.ENDPOINTS.RATE_SERVICE,
        'GetExchangeRateByCurrency',
        { currencyCode: currency, date: formattedDate },
        env
      );

      const finalRate = parseFloat(rateResult);
      if (isNaN(finalRate)) throw new Error(`INVALID_NUMBER`);

      await env.REGISTAR_DB.prepare(`
        INSERT INTO nbs_kursna_lista_cache (valuta, datum, kurs) 
        VALUES (?, ?, ?)
        ON CONFLICT(valuta, datum) DO UPDATE SET kurs = excluded.kurs
      `).bind(currency, dateStr, finalRate).run();

      this.memoryCache.set(cacheKey, finalRate);
      return finalRate;

    } catch (error: any) {
      console.error(`🚨 [NBS-API-FAIL] NBS nedostupan za ${currency} na ${dateStr} (Greška: ${error?.message || error}). Pokrećem fallback...`);
      return await this.getLatestAvailableFallback(currency, env);
    }
  }

  // --- Exchange Rate Methods (Official CommunicationOfficeService1_0) ---

  static async getCurrentExchangeRate(exchangeRateListTypeID: number, env: NbsEnv): Promise<any> {
    return this.callSoap(this.ENDPOINTS.CURRENT_EXCHANGE_RATE_XML, 'GetCurrentExchangeRate', { exchangeRateListTypeID }, env);
  }

  static async getCurrentExchangeRateList(exchangeRateListTypeID: number, env: NbsEnv): Promise<any> {
    return this.callSoap(this.ENDPOINTS.CURRENT_EXCHANGE_RATE_XML, 'GetCurrentExchangeRateList', { exchangeRateListTypeID }, env);
  }

  static async getExchangeRateByCurrency(currencyCode: number, dateFrom: string, dateTo: string, exchangeRateListTypeID: number, env: NbsEnv): Promise<any> {
    return this.callSoap(this.ENDPOINTS.EXCHANGE_RATE_XML, 'GetExchangeRateByCurrency', {
      currencyCode,
      dateFrom: dateFrom.replace(/-/g, '.'),
      dateTo: dateTo.replace(/-/g, '.'),
      exchangeRateListTypeID
    }, env);
  }

  static async getExchangeRateByDate(date: string, exchangeRateListTypeID: number, env: NbsEnv): Promise<any> {
    const formattedDate = date.replace(/-/g, '.');
    return this.callSoap(this.ENDPOINTS.EXCHANGE_RATE_XML, 'GetExchangeRateByDate', { date: formattedDate, exchangeRateListTypeID }, env);
  }

  static async getExchangeRateByListNumber(exchangeRateListNumber: number, year: number, exchangeRateListTypeID: number, env: NbsEnv): Promise<any> {
    return this.callSoap(this.ENDPOINTS.EXCHANGE_RATE_XML, 'GetExchangeRateByListNumber', { exchangeRateListNumber, year, exchangeRateListTypeID }, env);
  }

  static async getExchangeRateList(
    exchangeRateListNumber: number | null, 
    year: number | null, 
    date: string | null, 
    exchangeRateListTypeID: number | null, 
    startItemNumber: number | null, 
    endItemNumber: number | null, 
    env: NbsEnv
  ): Promise<any> {
    const params: Record<string, any> = {};
    if (exchangeRateListNumber !== null) params.exchangeRateListNumber = exchangeRateListNumber;
    if (year !== null) params.year = year;
    if (date !== null) params.date = date.replace(/-/g, '.');
    if (exchangeRateListTypeID !== null) params.exchangeRateListTypeID = exchangeRateListTypeID;
    if (startItemNumber !== null) params.startItemNumber = startItemNumber;
    if (endItemNumber !== null) params.endItemNumber = endItemNumber;

    return this.callSoap(this.ENDPOINTS.EXCHANGE_RATE_XML, 'GetExchangeRateList', params, env);
  }

  static async getExchangeRateListCount(
    exchangeRateListNumber: number | null, 
    year: number | null, 
    date: string | null, 
    exchangeRateListTypeID: number | null, 
    env: NbsEnv
  ): Promise<any> {
    const params: Record<string, any> = {};
    if (exchangeRateListNumber !== null) params.exchangeRateListNumber = exchangeRateListNumber;
    if (year !== null) params.year = year;
    if (date !== null) params.date = date.replace(/-/g, '.');
    if (exchangeRateListTypeID !== null) params.exchangeRateListTypeID = exchangeRateListTypeID;

    return this.callSoap(this.ENDPOINTS.EXCHANGE_RATE_XML, 'GetExchangeRateListCount', params, env);
  }

  static async getExchangeRateListType(exchangeRateListTypeID: number | null, env: NbsEnv): Promise<any> {
    const params: Record<string, any> = {};
    if (exchangeRateListTypeID !== null) params.exchangeRateListTypeID = exchangeRateListTypeID;
    // Preма документацији, ова метода припада и текућим и општим сервисима, користимо CURRENT за конзистентност
    return this.callSoap(this.ENDPOINTS.CURRENT_EXCHANGE_RATE_XML, 'GetExchangeRateListType', params, env);
  }

  static async getCurrentExchangeRateByRateType(currencyCode: number, exchangeRateListTypeID: number, rateType: number, env: NbsEnv): Promise<any> {
    return this.callSoap(this.ENDPOINTS.CURRENT_EXCHANGE_RATE_XML, 'GetCurrentExchangeRateByRateType', { 
      currencyCode, 
      exchangeRateListTypeID, 
      rateType 
    }, env);
  }

  static async getExchangeRateByRateType(currencyCode: number, date: string, exchangeRateListTypeID: number, rateType: number, env: NbsEnv): Promise<any> {
    return this.callSoap(this.ENDPOINTS.EXCHANGE_RATE_XML, 'GetExchangeRateByRateType', { 
      currencyCode,
      date: date.replace(/-/g, '.'), 
      exchangeRateListTypeID,
      rateType
    }, env);
  }

  static async getExchangeRateRsdEur(date: string, typeID: number | null, env: NbsEnv): Promise<any> {
    const params: Record<string, any> = { date: date.replace(/-/g, '.') };
    if (typeID !== null) params.typeID = typeID;
    return this.callSoap(this.ENDPOINTS.EXCHANGE_RATE_XML, 'GetExchangeRateRsdEur', params, env);
  }

  static async getExchangeRateRsdEurByPeriod(dateFrom: string, dateTo: string, typeID: number | null, env: NbsEnv): Promise<any> {
    const params: Record<string, any> = {
      dateFrom: dateFrom.replace(/-/g, '.'),
      dateTo: dateTo.replace(/-/g, '.')
    };
    if (typeID !== null) params.typeID = typeID;
    return this.callSoap(this.ENDPOINTS.EXCHANGE_RATE_XML, 'GetExchangeRateRsdEurByPeriod', params, env);
  }

  static async getCurrentExchangeRateRsdEur(env: NbsEnv): Promise<any> {
    return this.callSoap(this.ENDPOINTS.EXCHANGE_RATE_XML, 'GetCurrentExchangeRateRsdEur', {}, env);
  }

  static async getExchangeRateRsdEurType(typeID: number | null, env: NbsEnv): Promise<any> {
    const params: Record<string, any> = {};
    if (typeID !== null) params.typeID = typeID;
    return this.callSoap(this.ENDPOINTS.EXCHANGE_RATE_XML, 'GetExchangeRateRsdEurType', params, env);
  }

  // --- Core / Codebook Methods ---

  static async getBanks(env: NbsEnv): Promise<any> {
    return this.callSoap(this.ENDPOINTS.CORE_XML, 'GetBanks', {}, env);
  }

  static async getCurrencies(env: NbsEnv): Promise<any> {
    return this.callSoap(this.ENDPOINTS.CORE_XML, 'GetCurrencies', {}, env);
  }

  static async getCountries(env: NbsEnv): Promise<any> {
    return this.callSoap(this.ENDPOINTS.CORE_XML, 'GetCountries', {}, env);
  }

  // --- Forced Collection (Prinudna naplata) ---

  static async getDebtorsInForcedCollection(env: NbsEnv): Promise<any> {
    return this.callSoap(this.ENDPOINTS.FORCED_COLLECTION_XML, 'GetDebtorsInForcedCollection', {}, env);
  }

  static async getReceivedUnexecutedDecisions(env: NbsEnv): Promise<any> {
    return this.callSoap(this.ENDPOINTS.FORCED_COLLECTION_XML, 'GetReceivedUnexecutedDecisions', {}, env);
  }

  // --- Financial Markets & Insurance ---

  static async getDpfInvestmentUnitValues(dateFrom: string, dateTo: string, env: NbsEnv): Promise<any> {
    return this.callSoap(this.ENDPOINTS.FINANCIAL_MARKET_XML, 'GetDpfInvestmentUnitValues', {
      dateFrom: dateFrom.replace(/-/g, '.'),
      dateTo: dateTo.replace(/-/g, '.')
    }, env);
  }

  static async getInsuranceParticipants(env: NbsEnv): Promise<any> {
    return this.callSoap(this.ENDPOINTS.INSURANCE_XML, 'GetInsuranceParticipants', {}, env);
  }

  // --- Registry Methods ---

  static async getAccountStatus(bankCode: string, accountNo: string, env: NbsEnv): Promise<any> {
    // Ovo je pretpostavljeni metod za proveru računa, NBS ima Registar računa
    return this.callSoap(this.ENDPOINTS.CORE_XML, 'GetAccountStatus', { bankCode, accountNo }, env);
  }

  private static async getLatestAvailableFallback(currency: string, env: NbsEnv): Promise<number> {
    try {
      const result = await env.REGISTAR_DB.prepare(`
        SELECT kurs FROM nbs_kursna_lista_cache 
        WHERE valuta = ? 
        ORDER BY datum DESC 
        LIMIT 1
      `).bind(currency).first<{ kurs: number }>();

      if (result && result.kurs) {
        return result.kurs;
      }
    } catch (err) {
      console.error(`🚨 [NBS-FATAL] Baza je nedostupna:`, err);
    }
    return currency === 'EUR' ? 117.2031 : 1.0;
  }
}

