import { PAYMENT_MEANS } from './constants.js';
import { Normalizer } from './normalizer.js';

/**
 * MasterValidator v4.19.1 — Centralni Digitalni Štit + Harmonizacija
 */
export class MasterValidator {
  static validate(data: any) {
    // 1. Harmonizacija
    const cleanData = Normalizer.sanitize(data);

    // 2. Validacija
    const errors: string[] = [];

    if (!cleanData.ID || !cleanData.broj || !cleanData.datumIzdavanja || !cleanData.pibProdavca || !cleanData.pibKupca) {
      errors.push("Nedostaju obavezna polja (ID, broj, datum, PIB)");
    }

    const amount = parseFloat(cleanData.LegalMonetaryTotal?.PayableAmount || cleanData.osnovica || 0);
    if (amount < 0) errors.push("Iznos ne može biti negativan");

    if (cleanData.InvoiceTypeCode === '386') {
      if (!cleanData.datumUplate) errors.push("Avans zahteva datum uplate");
    }
    
    if (cleanData.InvoiceTypeCode === '381') {
      if (!cleanData.billingReference?.invoiceId) errors.push("381 zahteva BillingReference");
      if (!cleanData.correctionReason) errors.push("Razlog korekcije je obavezan");
    }

    if (cleanData.valuta !== 'RSD' && (!cleanData.exchangeRate || cleanData.exchangeRate <= 0)) {
      errors.push("Strana valuta zahteva kurs");
    }

    if (errors.length > 0) {
      throw new Error(`🛡️ [MasterValidator] FATAL: ${errors.join(' | ')}`);
    }
    
    return cleanData;
  }
}
