/// <reference types="@cloudflare/workers-types" />
import { D1Database } from "@cloudflare/workers-types";

export interface D1Document {
  id: string;
  sefId?: string;
  tip: string;
  broj: string;
  pibProdavca: string;
  pibKupca: string;
  status: string;
  iznosOsnovica?: number;
  iznosPoreza?: number;
  datumPrometa?: string;
  xmlBlob?: string;
  jsonMetadata?: any;
  parentId?: string | null;
}

export interface D1DocumentLine {
  dokumentId: string;
  lineId?: string;
  naziv: string;
  poslataKolicina?: number;
  primljenaKolicina?: number;
  jedinicaMere?: string;
  cena?: number;
  porezStopa?: number;
  porezKategorija?: string;
  osnovica?: number;
  iznosPoreza?: number;
  razlika?: number;

  // Akcizni blok (v4.30.0)
  akciznaKategorija?: string;
  akciznaGustina?: number;
  izvornaStavkaId?: string;
}

/**
 * D1SyncBridge - The Relational Core (SSoT)
 * Manages all document lifecycle events in D1 to ensure system-wide observability.
 */
export class D1SyncBridge {
  constructor(private db: D1Database) {}

  /**
   * upsertDocument - Atomic write to D1 document registry
   */
  async upsertDocument(doc: D1Document) {
    return await this.db.prepare(`
      INSERT INTO dokumenti (
        id, sef_id, tip, broj, pib_prodavca, pib_kupca, status, 
        iznos_osnovica, iznos_poreza, datum_prometa, 
        xml_blob, json_metadata, parent_id, azurirano_u
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        sef_id = COALESCE(excluded.sef_id, sef_id),
        status = excluded.status,
        xml_blob = COALESCE(excluded.xml_blob, xml_blob),
        json_metadata = COALESCE(excluded.json_metadata, json_metadata),
        azurirano_u = CURRENT_TIMESTAMP
    `).bind(
      doc.id ?? null, 
      doc.sefId ?? null,
      doc.tip ?? null, 
      doc.broj ?? null, 
      doc.pibProdavca ?? null, 
      doc.pibKupca ?? null, 
      doc.status ?? null, 
      doc.iznosOsnovica ?? 0,
      doc.iznosPoreza ?? 0,
      doc.datumPrometa ?? null,
      doc.xmlBlob ?? null,
      doc.jsonMetadata ? JSON.stringify(doc.jsonMetadata) : null,
      doc.parentId ?? null
    ).run();
  }

  /**
   * upsertLines - Atomic write for document line items
   */
  async upsertLines(lines: D1DocumentLine[]) {
    if (lines.length === 0) return;

    const statements = lines.map(l => 
      this.db.prepare(`
        INSERT INTO dokument_stavke (
          dokument_id, line_id, naziv, poslata_kolicina, primljena_kolicina, 
          jedinica_mere, cena, porez_stopa, porez_kategorija, osnovica, iznos_poreza, razlika,
          akcizna_kategorija, akcizna_gustina, izvorna_stavka_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(dokument_id, line_id) DO UPDATE SET
          primljena_kolicina = excluded.primljena_kolicina,
          razlika = excluded.razlika,
          akcizna_kategorija = COALESCE(excluded.akcizna_kategorija, akcizna_kategorija),
          akcizna_gustina = COALESCE(excluded.akcizna_gustina, akcizna_gustina),
          izvorna_stavka_id = COALESCE(excluded.izvorna_stavka_id, izvorna_stavka_id)
      `).bind(
        l.dokumentId ?? null, 
        l.lineId ?? null, 
        l.naziv ?? null, 
        l.poslataKolicina ?? 0, 
        l.primljenaKolicina ?? 0,
        l.jedinicaMere ?? null,
        l.cena ?? 0,
        l.porezStopa ?? 0,
        l.porezKategorija ?? null,
        l.osnovica ?? 0,
        l.iznosPoreza ?? 0,
        l.razlika ?? 0,
        l.akciznaKategorija ?? null,
        l.akciznaGustina ?? null,
        l.izvornaStavkaId ?? null
      )
    );

    return await this.db.batch(statements);
  }

  /**
   * logEvent - Mandatory Audit Trail (Zakon o eOtpremnicama)
   */
  async logEvent(dokumentId: string, noviStatus: string, message?: string, stariStatus?: string) {
    return await this.db.prepare(`
      INSERT INTO dokumenti_log (dokument_id, prethodni_status, novi_status, poruka)
      VALUES (?, ?, ?, ?)
    `).bind(dokumentId ?? null, stariStatus ?? null, noviStatus ?? null, message ?? null).run();
  }

  /**
   * linkDocuments - Link child document to parent (e.g. Otpremnica -> Faktura)
   */
  async linkDocuments(childId: string, parentId: string) {
    return await this.db.prepare("UPDATE dokumenti SET parent_id = ?, azurirano_u = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(parentId ?? null, childId ?? null).run();
  }

  /**
   * getDocumentChain - Retrieves the entire lineage of a document using a recursive CTE.
   * v4.5.0: Supports multi-level supply chain traceability (e.g. Order -> Despatch -> Invoice -> CN).
   */
  async getDocumentChain(id: string) {
    return await this.db.prepare(`
      WITH RECURSIVE chain AS (
        SELECT id, parent_id FROM dokumenti WHERE id = ?
        UNION ALL
        SELECT d.id, d.parent_id FROM dokumenti d
        JOIN chain c ON d.id = c.parent_id OR d.parent_id = c.id
      )
      SELECT DISTINCT d.* FROM dokumenti d JOIN chain c ON d.id = c.id
      ORDER BY d.kreirano_u ASC
    `).bind(id ?? null).all();
  }

  /**
   * analyzeReconciliation - Quantitative and Excise Deviation Analysis
   * v4.31.0: Detects theft, leaks, density changes, or quantitative errors.
   */
  async analyzeReconciliation(otpremnicaId: string) {
    return await this.db.prepare(`
      SELECT 
        o.line_id as stavka_otpremnice_id,
        o.naziv as artikal_naziv,
        o.poslata_kolicina,
        p.primljena_kolicina,
        p.razlika as odbijena_kolicina,
        o.akcizna_gustina as gustina_otprema,
        p.akcizna_gustina as gustina_prijem,
        
        -- Kalkulacija anomalija
        (o.poslata_kolicina - (IFNULL(p.primljena_kolicina, 0) + IFNULL(p.razlika, 0))) as kvantitativni_manjak,
        (IFNULL(o.akcizna_gustina, 0) - IFNULL(p.akcizna_gustina, 0)) as devijacija_gustine
      FROM dokument_stavke o
      LEFT JOIN dokument_stavke p ON o.line_id = p.izvorna_stavka_id AND p.dokument_id IN (
        SELECT id FROM dokumenti WHERE parent_id = o.dokument_id AND tip = 'PRIJEMNICA'
      )
      WHERE o.dokument_id = ?
    `).bind(otpremnicaId ?? null).all();
  }

  /**
   * getMonthlyStats - High-performance aggregation for dashboards
   */
  async getMonthlyStats(pib: string) {
    return await this.db.prepare(`
      SELECT 
        strftime('%Y-%m', created_at) as mesec,
        tip,
        status,
        COUNT(*) as broj,
        SUM(iznos_osnovica) as suma_osnovica
      FROM dokumenti
      WHERE pib_prodavca = ? OR pib_kupca = ?
      GROUP BY mesec, tip, status
      ORDER BY mesec DESC
    `).bind(pib ?? null, pib ?? null).all();
  }
}
