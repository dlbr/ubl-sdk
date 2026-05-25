import { PAYMENT_MEANS } from '../constants/sefTaxonomy.js';
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
// 1. Strukturalna provera
if (!cleanData.ID || !cleanData.broj || !cleanData.datumIzdavanja || !cleanData.pibProdavca || !cleanData.pibKupca) {
  errors.push("Nedostaju obavezna polja (ID, broj, datum, PIB)");
}

// 2. PIB validacija
if (cleanData.pibKupca && !/^\d{9}$/.test(cleanData.pibKupca)) {
  errors.push("PIB mora imati 9 cifara");
}

// 3. Finansijska provera
const amount = parseFloat(cleanData.LegalMonetaryTotal?.PayableAmount || cleanData.osnovica || 0);
if (amount < 0) errors.push("Iznos ne može biti negativan");

if (cleanData.InvoiceTypeCode === '386') {
  if (!cleanData.datumUplate) errors.push("Avans zahteva datum uplate");
  if (!cleanData.billingReference?.invoiceId) errors.push("386 zahteva BillingReference");
  if (cleanData.datumIzdavanja && cleanData.datumUplate && new Date(cleanData.datumIzdavanja) > new Date(cleanData.datumUplate)) {
    errors.push("Rok plaćanja ne može biti pre datuma izdavanja");
  }
}

if (cleanData.InvoiceTypeCode === '381') {
  if (!cleanData.billingReference?.invoiceId) errors.push("381 zahteva BillingReference");
  if (!cleanData.correctionReason) errors.push("Razlog korekcije je obavezan");
}

// 4. Izvoz (Foreign Trade) - only if valuta is provided and not RSD
if (cleanData.valuta && cleanData.valuta !== 'RSD' && (!cleanData.exchangeRate || cleanData.exchangeRate <= 0)) {
  errors.push("Strana valuta zahteva kurs");
}

    if (errors.length > 0) {
      throw new Error(`🛡️ [MasterValidator] FATAL: ${errors.join(' | ')}`);
    }
    
    return cleanData;
  }
}
