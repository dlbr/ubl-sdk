import { posaljiHotfixTelegramAlarm } from './telegram-notifier';
import { SefErrorLogger } from './errorLogger';

export type ErrorSeverity = 'CRITICAL' | 'WARNING' | 'AUTH_ERR' | 'SCHEMA_ERR' | 'UNKNOWN';

export interface SefErrorBody {
  Message?: string;
  message?: string;
  ErrorCode?: string;
  errorCode?: string;
  FieldName?: string;
  fieldName?: string;
}

export class ErrorShield {
  /**
   * Categorizes SEF API errors based on status code and response body.
   * Aligned with 2026 MFIN forensic rules.
   */
  static categorize(status: number, body: SefErrorBody): ErrorSeverity {
    const msg = body.Message || body.message || "";
    const code = body.ErrorCode || body.errorCode || "";

    // 1. AUTH/SECURITY
    if (status === 401 || msg.includes('Invalid key') || msg.includes('tampered data')) {
      return 'AUTH_ERR';
    }

    // 2. CRITICAL
    if (status >= 500 || code === 'ErrorSavingFile' || code.includes('TaxTotalNotValid')) {
      return 'CRITICAL';
    }

    // 3. SCHEMA/VALIDATION
    if (status === 400) {
      return 'SCHEMA_ERR';
    }

    // 4. RATE LIMITING
    if (status === 429) {
      return 'WARNING';
    }

    return 'UNKNOWN';
  }

  /**
   * Orchestrates the response to a SEF error.
   */
  static async handle(env: any, invoiceId: string, status: number, body: SefErrorBody, xml?: string): Promise<ErrorSeverity> {
    const severity = this.categorize(status, body);
    const msg = body.Message || body.message || "Unknown error";
    const code = body.ErrorCode || body.errorCode || "NoCode";

    if (xml) {
      await SefErrorLogger.logFailure(invoiceId, xml, body);
    }

    switch (severity) {
      case 'CRITICAL':
        await posaljiHotfixTelegramAlarm(`[CRIT] ${invoiceId}: ${msg} (${code})`, invoiceId, env);
        break;
      case 'AUTH_ERR':
        await posaljiHotfixTelegramAlarm(`[AUTH] ${invoiceId}: Nevalidan ključ. Potrebna rotacija.`, invoiceId, env);
        break;
      case 'SCHEMA_ERR':
        console.warn(`[ErrorShield] Schema error for ${invoiceId}: ${msg}`);
        break;
    }

    return severity;
  }
}

