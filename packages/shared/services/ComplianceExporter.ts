import JSZip from 'jszip';
import { CryptographicLedger, hmac } from './CryptographicLedger';
import { ComplianceCertificateBuilder } from './ComplianceCertificateBuilder';

export class ComplianceExporter {
  /**
   * Generiše kompletan "Audit-Ready" ZIP paket za specifični dokument.
   * Paket sadrži originalni XML, metapodatke, puni audit log i PDF sertifikat.
   */
  public static async generatePackage(
    db: any,
    documentId: string,
    pdfServiceUrl: string,
    pdfServiceApiKey: string,
    options: {
      companyName: string;
      verificationBaseUrl: string;
      complianceKv?: any; // Cloudflare KVNamespace
    }
  ): Promise<Uint8Array> {
    // 1. Prikupljanje dokaza
    const auditLogs = await db
      .prepare("SELECT * FROM revizorski_trag WHERE dokument_id = ? ORDER BY redosled ASC")
      .bind(documentId)
      .all();

    const docMeta = await db
      .prepare("SELECT xml_blob, json_metadata, status, broj, datum_prometa FROM dokumenti WHERE id = ?")
      .bind(documentId)
      .first<any>();

    if (!docMeta) {
      throw new Error(`DOKUMENT_NOT_FOUND: ${documentId}`);
    }

    const lastLog = auditLogs.results[auditLogs.results.length - 1];
    const integrityHash = lastLog?.trenutni_hash || "NOT_SEALED";

    // 2. Registracija u Compliance KV (za javnu verifikaciju)
    if (options.complianceKv && integrityHash !== "NOT_SEALED") {
      await options.complianceKv.put(integrityHash, JSON.stringify({
        id: docMeta.broj || documentId,
        timestamp: new Date().toISOString(),
        pib: docMeta.pibKupca || "N/A"
      }));
    }

    // 3. Generisanje PDF Sertifikata via Mikroservis
    const certificatePayload = ComplianceCertificateBuilder.build({
      invoiceId: docMeta.broj || documentId,
      issueDate: docMeta.datum_prometa || "N/A",
      integrityHash: integrityHash,
      verificationUrl: `${options.verificationBaseUrl}/verify?h=${integrityHash}`,
      companyName: options.companyName
    });

    const payloadString = JSON.stringify(certificatePayload);
    const timestamp = Date.now().toString();
    const signature = await hmac(payloadString + timestamp, pdfServiceApiKey);

    const pdfResponse = await fetch(pdfServiceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': signature,
        'X-Timestamp': timestamp
      },
      body: payloadString
    });

    if (!pdfResponse.ok) {
      const errorText = await pdfResponse.text();
      throw new Error(`PDF_GEN_FAILED: ${pdfResponse.status} ${errorText}`);
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();

    // 3. Pakovanje u ZIP (The Golden ZIP)
    const zip = new JSZip();
    
    // Originalni XML
    if (docMeta.xml_blob) {
      zip.file(`faktura_${docMeta.broj}.xml`, docMeta.xml_blob);
    }

    // Metapodaci
    zip.file("metadata.json", JSON.stringify({
      id: documentId,
      broj: docMeta.broj,
      status: docMeta.status,
      datum_prometa: docMeta.datum_prometa,
      izvezeno_u: new Date().toISOString()
    }, null, 2));

    // Puni audit trail
    zip.file("audit_trail.json", JSON.stringify({
      documentId,
      verification: await CryptographicLedger.verifyChain(db),
      history: auditLogs.results.map((log: any) => ({
        event: log.dogadjaj,
        hash: log.trenutni_hash,
        prevHash: log.prethodni_hash,
        timestamp: log.kreirano_u,
        details: JSON.parse(log.detalji || "{}")
      }))
    }, null, 2));

    // PDF Sertifikat
    zip.file("compliance_certificate.pdf", pdfBuffer);

    // README za inspektora
    zip.file("README_INSPEKTOR.txt", `SEF BRIDGE — IZVEŠTAJ O INTEGRITETU
----------------------------------
Dokument: ${docMeta.broj}
ID: ${documentId}
Status: ${docMeta.status}

Ovaj ZIP paket sadrži sve relevantne dokaze o autentičnosti elektronskog dokumenta.
Kriptografski lanac (audit_trail.json) dokazuje da dokument nije menjan nakon slanja.
Sertifikat (compliance_certificate.pdf) sadrži QR kod za on-line verifikaciju.`);

    return await zip.generateAsync({ type: "uint8array" });
  }
}
