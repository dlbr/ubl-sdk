/**
 * SefLiveValidator - Dynamic validation based on state-cached metadata.
 * Uses Cloudflare KV as a fast Edge source for official state codebooks.
 */
/**
 * KeyValueStore - Abstraction layer for metadata retrieval.
 * Allows SEF Bridge logic to be agnostic of the storage provider.
 */
export interface KeyValueStore {
  get(key: string): Promise<any>;
}

/**
 * SefLiveValidator - Dynamic validation based on abstract state storage.
 * Aligned with 2026 MFIN forensic rules.
 */
export class SefLiveValidator {
  private static cache: Map<string, any> = new Map();
  private static CACHE_TTL = 300000; // 5 minutes in-memory

  private static getCached(key: string) {
    const entry = this.cache.get(key);
    if (entry && (Date.now() - entry.timestamp < this.CACHE_TTL)) {
      return entry.data;
    }
    return null;
  }

  private static setCache(key: string, data: any) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Validates unit measure code against the provided store (e.g., H87, PCE, KGM).
   */
  static async validateUnitMeasure(code: string, store: KeyValueStore): Promise<boolean> {
    const cached = this.getCached("unit_measures");
    if (cached) return cached.includes(code);

    try {
      const raw = await store.get("DRZAVNE_JEDINICE_MERA") as string[] | null;
      if (!raw) {
        console.warn("[Validator] STORE_MISSING_FALLBACK: Koristim dozvoljene default kodove (H87, PCE, KGM, DAY, HUR).");
        const defaults = ["H87", "PCE", "KGM", "DAY", "HUR"];
        return defaults.includes(code);
      }

      this.setCache("unit_measures", raw);
      return raw.includes(code);
    } catch (e) {
      console.error("[Validator] STORE_FETCH_ERROR for units:", e);
      return true; // Permissive fallback
    }
  }

  /**
   * Retrieves live tax rules from the provided store.
   */
  static async getLiveTaxRules(store: KeyValueStore): Promise<any> {
    const cached = this.getCached("tax_rules");
    if (cached) return cached;

    const defaults = {
      ZAKONSKI_ROK_DANA: 10,
      OPSTA_STOPA_PDV: 20.00,
      POSEBNA_STOPA_PDV: 10.00,
      DOZVOLJENE_KATEGORIJE: ["S", "E", "AE", "Z", "OE", "R", "G", "O", "N", "S20", "S10", "AE20", "AE10"],
      UBL_VERSION: "2.1",
      COMPLIANCE_YEAR: 2026
    };

    try {
      const raw = await store.get("DRZAVNA_PORESKA_PRAVILA_RS");
      const rules = raw || defaults;
      this.setCache("tax_rules", rules);
      return rules;
    } catch (e) {
      console.error("[Validator] STORE_FETCH_ERROR for tax rules:", e);
      return defaults;
    }
  }

  /**
   * Validates tax category code against the provided store.
   */
  static async validateTaxCategory(category: string, store: KeyValueStore): Promise<boolean> {
    const rules = await this.getLiveTaxRules(store);
    const allowed = rules.DOZVOLJENE_KATEGORIJE || ["S", "E", "AE", "Z", "OE", "R", "G", "O", "N"];
    return allowed.includes(category);
  }
}
