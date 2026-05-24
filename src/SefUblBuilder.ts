export class SefUblBuilder {
  private invoice: any = {
    ID: "DEFAULT-001",
    broj: "F-2026-001",
    datumIzdavanja: new Date().toISOString().split('T')[0],
    InvoiceTypeCode: "380",
    valuta: "RSD"
  };

  static create(): SefUblBuilder {
    return new SefUblBuilder();
  }

  withID(id: string): this {
    this.invoice.ID = id;
    return this;
  }

  withIssueDate(date: string): this {
    this.invoice.datumIzdavanja = date;
    return this;
  }

  withDueDate(date: string): this {
    this.invoice.datumUplate = date;
    return this;
  }

  withPib(pibProdavca: string, pibKupca: string): this {
    this.invoice.pibProdavca = pibProdavca;
    this.invoice.pibKupca = pibKupca;
    return this;
  }

  withAmount(amount: number): this {
    this.invoice.osnovica = amount;
    return this;
  }

  withTypeCode(code: string): this {
    this.invoice.InvoiceTypeCode = code;
    return this;
  }

  build(): any {
    return { ...this.invoice };
  }
}
