import * as fs from 'fs';
import * as path from 'path';

/**
 * Archiver servis za automatsko, forenzički sigurno čuvanje UBL faktura i odgovora servera.
 */
export class Archiver {
  static archive(invoiceId: string, xmlContent: string, responseData: any) {
    try {
      const now = new Date();
      // Osiguraj da imamo bazu za arhivu u root-u
      const baseDir = path.join(process.cwd(), 'docs/archive');
      const dir = path.join(
        baseDir,
        now.getFullYear().toString(),
        (now.getMonth() + 1).toString().padStart(2, '0')
      );

      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const timestamp = now.toISOString().replace(/[:.]/g, '-');
      const safeInvoiceId = invoiceId.replace(/[^a-z0-9]/gi, '_');
      
      // Čuvamo XML fakturu
      fs.writeFileSync(path.join(dir, `${safeInvoiceId}_${timestamp}.xml`), xmlContent);
      
      // Čuvamo JSON odziv (Audit Trail)
      fs.writeFileSync(
        path.join(dir, `${safeInvoiceId}_${timestamp}_meta.json`), 
        JSON.stringify({ invoiceId, timestamp, response: responseData }, null, 2)
      );

      console.log(`🗄️ Faktura ${invoiceId} forenzički arhivirana u: ${dir}`);
    } catch (err) {
      console.error(`❌ Kritična greška pri arhiviranju fakture ${invoiceId}:`, err);
    }
  }
}
