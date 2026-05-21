/**
 * SefLiveValidator - Dynamic validation based on state-cached metadata.
 * Uses Cloudflare KV as a fast Edge source for official state codebooks.
 */
export class SefLiveValidator {
  
  /**
   * Validates unit measure code against official SEF codebook (e.g., H87, PCE, KGM).
   */
  static async validateUnitMeasure(code: string, env: any): Promise<boolean> {
    const raw = await env.PORESKI_KV.get("DRZAVNE_JEDINICE_MERA", "json") as string[] | null;
    if (!raw) return true; // Fallback to permissive mode if KV is missing

    // Official codes are case-sensitive but usually uppercase
    return raw.includes(code);
  }

  /**
   * Retrieves live tax rules and configuration from Cloudflare KV.
   */
  static async getLiveTaxRules(env: any): Promise<any> {
    const raw = await env.PORESKI_KV.get("DRZAVNA_PORESKA_PRAVILA_RS", "json");
    return raw || {
      ZAKONSKI_ROK_DANA: 10,
      OPSTA_STOPA_PDV: 20.00,
      POSEBNA_STOPA_PDV: 10.00,
      DOZVOLJENE_KATEGORIJE: ["S", "E", "AE", "Z", "OE", "R", "G", "O", "N", "S20", "S10", "AE20", "AE10"]
    };
  }

  /**
   * Validates tax category code.
   */
  static async validateTaxCategory(category: string, env: any): Promise<boolean> {
    const rules = await this.getLiveTaxRules(env);
    const allowed = rules.DOZVOLJENE_KATEGORIJE || ["S", "E", "AE", "Z", "OE", "R", "G", "O", "N"];
    return allowed.includes(category);
  }
}
