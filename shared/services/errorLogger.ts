import fs from 'node:fs';
import path from 'node:fs';

/**
 * Diagnostic logger for SEF failures.
 * Captures the raw XML stream for forensic analysis.
 */
export class SefErrorLogger {
  private static LOG_DIR = 'docs/json/failed_invoices';

  static async logFailure(invoiceId: string, xml: string, error: any) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${invoiceId}_${timestamp}.xml`;
    const logPath = `docs/json/failed_invoices/${filename}`;
    
    const content = `<!-- ERROR: ${JSON.stringify(error)} -->\n${xml}`;
    
    // We use standard fs.writeFileSync for speed in local/test environments
    // In production (worker), this is replaced by R2 archival.
    try {
      if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        const fsNode = await import('node:fs');
        if (!fsNode.default.existsSync('docs/json/failed_invoices')) {
           fsNode.default.mkdirSync('docs/json/failed_invoices', { recursive: true });
        }
        fsNode.default.writeFileSync(logPath, content);
        console.log(`[Forensic Log] Neuspela faktura sačuvana: ${logPath}`);
      }
    } catch (e) {
      // Silent fail to not break the primary flow
    }
  }
}
