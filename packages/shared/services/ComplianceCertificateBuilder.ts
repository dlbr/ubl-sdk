export class ComplianceCertificateBuilder {
  /**
   * Generiše akcioni model za PDF servis koji opisuje Sertifikat o integritetu.
   * Ovaj dokument služi kao "svedok" (witness) da je transakcija digitalno zapečaćena.
   */
  public static build(data: {
    invoiceId: string;
    issueDate: string;
    integrityHash: string;
    verificationUrl: string;
    companyName: string;
  }) {
    return {
      config: { 
        margin: 40,
        font: "Inter"
      },
      actions: [
        { type: "text", value: "SERTIFIKAT O INTEGRITETU", size: 20, bold: true },
        { type: "line", thickness: 2 },
        { type: "move", value: 20 },
        
        { type: "text", value: `Faktura ID: ${data.invoiceId}`, size: 12 },
        { type: "text", value: `Datum arhiviranja: ${new Date().toISOString().split('T')[0]}`, size: 10 },
        { type: "text", value: `Izdavalac: ${data.companyName}`, size: 10 },
        
        { type: "move", value: 10 },
        { type: "text", value: "Digitalni otisak (Hash):", size: 10, bold: true },
        { type: "text", value: data.integrityHash, size: 8, font: "Courier" },
        
        { type: "move", value: 30 },
        
        { 
          type: "qr", 
          value: data.verificationUrl, 
          size: 150 
        },
        
        { type: "move", value: 20 },
        { type: "text", value: "Ovaj dokument je kriptografski zapečaćen u Revizorskom Tragu.", size: 10 },
        { type: "text", value: "Skenirajte QR kod za on-line potvrdu integriteta.", size: 10 },
        
        { type: "move", value: 40 },
        { type: "text", value: "Sistem: SEF Bridge", size: 8, color: "#666666" }
      ]
    };
  }
}
