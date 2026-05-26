import { XMLParser } from 'fast-xml-parser';

export interface NbsEnv {
  NBS_USERNAME: string;
  NBS_PASSWORD: string;
  NBS_LICENCE_ID: string;
  REGISTAR_DB: any;
}

export class NbsSoapService {
  private static memoryCache = new Map<string, number>();
  private static parser = new XMLParser({
    ignoreAttributes: true,
    removeNSPrefix: true
  });

  static async getMiddleRate(
    currency: 'EUR' | 'USD' | 'CHF', 
    dateStr: string,
    env: NbsEnv
  ): Promise<number> {
    if ((currency as string) === 'RSD') return 1.0;

    const cacheKey = `${currency}_${dateStr}`;
    if (this.memoryCache.has(cacheKey)) {
      return this.memoryCache.get(cacheKey)!;
    }

    try {
      // 🟢 Lvl 2: Provera u bazi podataka
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
    <GetExchangeRateByCurrency xmlns="http://communicationoffice.nbs.rs">
      <currencyCode>${currency}</currencyCode>
      <date>${formattedDate}</date>
    </GetExchangeRateByCurrency>
  </soap:Body>
</soap:Envelope>`;

    try {
      const response = await fetch('https://www.nbs.rs/communicationoffice/ExchangeRateRateService.asmx', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': '"http://communicationoffice.nbs.rs/GetExchangeRateByCurrency"'
        },
        body: soapEnvelope
      });

      if (!response.ok) throw new Error(`HTTP_${response.status}`);

      const xmlText = await response.text();
      const jsonObj = this.parser.parse(xmlText);
      const rateResult = jsonObj?.Envelope?.Body?.GetExchangeRateByCurrencyResponse?.GetExchangeRateByCurrencyResult;

      if (!rateResult) throw new Error(`PARSING_ERROR`);

      const finalRate = parseFloat(rateResult);
      if (isNaN(finalRate)) throw new Error(`INVALID_NUMBER`);

      await env.REGISTAR_DB.prepare(`
        INSERT INTO nbs_kursna_lista_cache (valuta, datum, kurs) 
        VALUES (?, ?, ?)
        ON CONFLICT(valuta, datum) DO UPDATE SET kurs = excluded.kurs
      `).bind(currency, dateStr, finalRate).run();

      this.memoryCache.set(cacheKey, finalRate);
      return finalRate;

    } catch (error) {
      console.error(`🚨 [NBS-API-FAIL] NBS nedostupan. Pokrećem fallback...`);
      return await this.getLatestAvailableFallback(currency, env);
    }
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
    // Apsolutni fallback u slučaju totalnog kraha
    return currency === 'EUR' ? 117.2031 : 1.0;
  }
}
