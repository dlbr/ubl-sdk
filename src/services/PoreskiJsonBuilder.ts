/**
 * Poreski JSON Builder za EEO/EPP.
 */
export class SefPoreskiJsonBuilder {
  private static num(val: any, fallback: number = 0): number {
    const n = parseFloat(val);
    return isNaN(n) ? fallback : n;
  }

  static buildZbirniEeoPayload(data: any) {
    const [y, m] = data.poreskiPeriod.split('-').map(Number);
    return {
      Year: y, Month: m,
      TaxRecords: [
        { TaxRatePercentage: 20, Amount: parseFloat(this.num(data.osnovicaOpsta).toFixed(2)), TaxAmount: parseFloat(this.num(data.pdvOpsta).toFixed(2)) },
        { TaxRatePercentage: 10, Amount: parseFloat(this.num(data.osnovicaPosebna).toFixed(2)), TaxAmount: parseFloat(this.num(data.pdvPosebna).toFixed(2)) }
      ]
    };
  }

  static buildPojedinacnaEeoPayload(data: any) {
    const period = data.poreskiPeriod || new Date().toISOString().slice(0, 7);
    const [y, m] = period.split('-').map(Number);
    const isCancellation = data.isCancellation || false;

    const payload: any = {
      Year: y,
      Month: m,
      Type: isCancellation ? "Cancellation" : "IndividualInternalInvoice",
      InternalInvoiceNumber: data.internalInvoiceNumber,
      TaxRecords: [],
      relatedVatRecords: data.relatedInternalNumber ? [{
        internalInvoiceNumber: data.relatedInternalNumber
      }] : []
    };

    if (isCancellation) {
      payload.TaxRecords.push({ TaxRatePercentage: 20, Amount: 0.00, TaxAmount: 0.00 });
    } else {
      if (data.osnovicaOpsta || data.pdvOpsta) {
        payload.TaxRecords.push({ TaxRatePercentage: 20, Amount: parseFloat(this.num(data.osnovicaOpsta).toFixed(2)), TaxAmount: parseFloat(this.num(data.pdvOpsta).toFixed(2)) });
      }
      if (data.osnovicaPosebna || data.pdvPosebna) {
        payload.TaxRecords.push({ TaxRatePercentage: 10, Amount: parseFloat(this.num(data.osnovicaPosebna).toFixed(2)), TaxAmount: parseFloat(this.num(data.pdvPosebna).toFixed(2)) });
      }
    }

    return payload;
  }

  static buildEppPayload(data: any) {
    const [y, m] = (data.period || data.poreskiPeriod).split('-').map(Number);
    return {
      Year: y, Month: m,
      InputTaxRecords: [
        { Type: "PurchaseInvoiced", TaxAmount: parseFloat(this.num(data.prethodniPorezOdObveznika).toFixed(2)) },
        { Type: "Import", TaxAmount: parseFloat(this.num(data.importPdvCarina).toFixed(2)) }
      ]
    };
  }
}
