import { SefPoreskiJsonBuilder } from './services/PoreskiJsonBuilder.js';
import { MasterValidator } from './validator.js';
import type { Invoice, Party, InvoiceLine, SefPoreskaKategorija } from './models/Invoice.js';
import { XmlTransformer } from './transformer/XmlTransformer.js';

export interface CreditNoteInput {
  broj: string;
  pibProdavca: string;
  pibKupca: string;
  originalnaFakturaBroj: string;
  originalnaFakturaSefId: string;
  originalniDatum: string;
  stavke: Array<{
    id: string;
    naziv: string;
    manjakKolicina: number;
    jedinicaMere: string;
    cena: number;
    porezStopa: number;
    porezKategorija: string;
  }>;
}

/**
 * SefUblBuilder - Facade za unazadnu kompatibilnost i brzo mapiranje flat JSON-a.
 */
export class SefUblBuilder {

  static buildCreditNote(input: CreditNoteInput): string {
    const { 
      broj, pibProdavca, pibKupca, originalnaFakturaBroj, 
      originalnaFakturaSefId, originalniDatum, stavke 
    } = input;

    let ukupnaOsnovica = 0;
    let ukupanPorez = 0;

    stavke.forEach(s => {
      const iznos = s.manjakKolicina * s.cena;
      const porez = iznos * (s.porezStopa / 100);
      ukupnaOsnovica += iznos;
      ukupanPorez += porez;
    });

    const ukupnaVrednost = ukupnaOsnovica + ukupanPorez;
    const trenutniDatum = '2026-05-26';

    let linesXml = '';
    stavke.forEach((s, idx) => {
      const lineExtensionAmount = Math.abs(s.manjakKolicina * s.cena).toFixed(2);
      linesXml += `
  <cac:CreditNoteLine>
    <cbc:ID>${s.id || (idx + 1)}</cbc:ID>
    <cbc:CreditedQuantity unitCode="${s.jedinicaMere}">${Math.abs(s.manjakKolicina)}</cbc:CreditedQuantity>
    <cbc:LineExtensionAmount currencyID="RSD">${lineExtensionAmount}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${s.naziv}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${s.porezKategorija}</cbc:ID>
        <cbc:Percent>${s.porezStopa.toFixed(2)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="RSD">${s.cena.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:CreditNoteLine>`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"
            xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
            xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:mfin.gov.rs:srbdt:2.1</cbc:CustomizationID>
  <cbc:ID>${broj}</cbc:ID>
  <cbc:IssueDate>${trenutniDatum}</cbc:IssueDate>
  <cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>
  <cbc:DocumentCurrencyCode>RSD</cbc:DocumentCurrencyCode>
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${originalnaFakturaBroj}</cbc:ID>
      <cbc:IssueDate>${originalniDatum}</cbc:IssueDate>
      <cbc:DocumentTypeCode>380</cbc:DocumentTypeCode>
      <cbc:UUID>${originalnaFakturaSefId}</cbc:UUID>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyTaxScheme><cbc:CompanyID>RS${pibProdavca}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyTaxScheme><cbc:CompanyID>RS${pibKupca}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RSD">${Math.abs(ukupnaOsnovica).toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RSD">${Math.abs(ukupnaOsnovica).toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RSD">${Math.abs(ukupnaVrednost).toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RSD">${Math.abs(ukupnaVrednost).toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${linesXml}
</CreditNote>`.trim();
  }

  static build(data: any): string {
    const type = data.InvoiceTypeCode || data.TipZapisa || '380';
    
    // 1. JSON Document Types
    if (type === 'EEO') return JSON.stringify(SefPoreskiJsonBuilder.buildZbirniEeoPayload(data));
    if (type === 'PEEO') return JSON.stringify(SefPoreskiJsonBuilder.buildPojedinacnaEeoPayload(data));
    if (type === 'EPP') return JSON.stringify(SefPoreskiJsonBuilder.buildEppPayload(data));
    
    // 2. Map data to robust Model (Tolerant Hybrid)
    const invoice: Invoice = {
      id: data.ID || data.broj || data.id,
      issueDate: data.IssueDate || data.datumIzdavanja || data.datum || new Date().toISOString().split('T')[0],
      dueDate: data.DueDate || data.datumDospeca || data.datumUplate || data.datumIzdavanja || new Date().toISOString().split('T')[0],
      paymentDate: data.datumUplate || data.avansDatum,
      deliveryDate: type === '386' ? undefined : (data.ActualDeliveryDate || data.datumPrometa),
      typeCode: type,
      currency: data.DocumentCurrencyCode || data.valuta || 'RSD',
      exchangeRate: parseFloat(data.PaymentExchangeRate || data.exchangeRate || 0),
      documentDirection: data.smerDokumenta,
      notes: [
        ...(data.notes || []),
        data.note || data.Note ? (data.note || data.Note) : null,
        ...(data.pfrBrojevi || []).map((pfr: string) => `Референтни број обрасца: ${pfr}`)
      ].filter(Boolean),
      seller: {
        pib: data.Supplier?.Pib || data.pibProdavca,
        name: data.Supplier?.Name || data.nazivProdavca || 'PRODAVAC',
        address: data.Supplier?.Address?.Street || data.adresaProdavca,
        city: data.Supplier?.Address?.City || data.gradProdavca,
        zip: data.Supplier?.Address?.Zip || data.postanskiBrojProdavca,
        maticniBroj: data.Supplier?.Mb || data.maticniBrojProdavca,
        jbkjs: data.Supplier?.Jbkjs || data.jbkjsProdavca,
        bankAccount: data.Supplier?.BankAccount || data.brojRacunaProdavca || '840-0000000000000-00'
      },
      buyer: {
        pib: data.Customer?.Pib || data.pibKupca,
        name: data.Customer?.Name || data.nazivKupca || 'KUPAC',
        address: data.Customer?.Address?.Street || data.adresaKupca,
        city: data.Customer?.Address?.City || data.gradKupca,
        zip: data.Customer?.Address?.Zip || data.postanskiBrojKupca,
        maticniBroj: data.Customer?.Mb || data.maticniBrojKupca,
        jbkjs: data.Customer?.Jbkjs || data.jbkjs
      },
      billingReference: (data.BillingReference?.ID || data.referentniRacun || data.avansBroj) ? {
        id: data.BillingReference?.ID || data.referentniRacun || data.avansBroj,
        date: data.BillingReference?.IssueDate || data.referentniDatum || data.avansDatum || '',
        typeCode: data.tipReferentnogDokumenta || (data.avansBroj ? '386' : '380')
      } : undefined,
      prepaymentReference: (data.avansBroj || data.odbitakAvansaSaPdv || data.avansPdv || data.iznosSmanjenjaPdv || (type === '386' && data.referentniRacun)) ? {
        id: data.avansBroj || data.referentniRacun,
        taxAmount: parseFloat(data.avansPdv || data.iznosSmanjenjaPdv || (data.odbitakAvansaSaPdv ? (parseFloat(data.odbitakAvansaSaPdv) - (parseFloat(data.odbitakAvansaSaPdv) / 1.2)) : 0))
      } : undefined,
      invoicePeriod: data.InvoicePeriod ? {
        startDate: data.InvoicePeriod.StartDate,
        endDate: data.InvoicePeriod.EndDate
      } : (data.periodOd ? {
        startDate: data.periodOd,
        endDate: data.periodDo || data.periodOd
      } : undefined),
      lines: []
    };

    // 3. Add default line if not present (legacy behavior)
    if (!data.Lines) {
      const osnovica = parseFloat(data.osnovica || data.iznos || data.iznosZaSmanjenjeOsnovice || data.iznosSmanjenjaOsnovice || data.iznosZaPovecanjeOsnovice || data.ukupnaOsnovica || 0);
      const pdvStopa = parseFloat(data.pdvStopa || 20);
      const cat = (data.poreskaKategorija || 'S') as SefPoreskaKategorija;
      const taxExemptionReason = data.sifraOslobodjenja;

      invoice.lines.push({
        description: data.item_name || data.razlog || 'Promet',
        quantity: 1,
        unitCode: 'H87',
        unitPrice: osnovica,
        taxRate: pdvStopa,
        taxCategory: cat,
        taxExemptionReason
      });
      
      // Handle Avans Reduction in Konacni
      if (data.avansBroj && data.odbitakAvansaSaPdv) {
        const odbitak = parseFloat(data.odbitakAvansaSaPdv);
        const netoOdbitka = odbitak / 1.2;
        invoice.lines.push({
          id: 'AVANS-REDUKCIJA',
          description: 'Umanjenje po avansu',
          quantity: -1,
          unitCode: 'H87',
          unitPrice: netoOdbitka,
          taxRate: 20,
          taxCategory: 'S'
        });
      }
    } else {
      // Map new lines format if present
      invoice.lines = data.Lines.map((l: any, i: number) => ({
        id: l.ID || l.id,
        description: l.ItemName || l.description,
        quantity: parseFloat(l.Quantity || l.quantity || 1),
        unitCode: l.UnitCode || l.unitCode || 'H87',
        unitPrice: parseFloat(l.UnitPrice || l.unitPrice || 0),
        taxRate: parseFloat(l.VatPercent || l.taxRate || 20),
        taxCategory: (l.VatCategory || l.taxCategory || 'S') as SefPoreskaKategorija,
        taxExemptionReason: l.TaxExemptionReasonCode || l.taxExemptionReason
      }));
    }

    // 4. Validate Model
    try {
      MasterValidator.validate(invoice);
    } catch (e: any) {
      throw e;
    }

    // 5. Transform to XML
    return XmlTransformer.toUblXml(invoice);
  }

  // Legacy helper methods
  static buildStandardna(data: any) { return this.build({ ...data, InvoiceTypeCode: '380' }); }
  static buildAvansni(data: any) { return this.build({ ...data, InvoiceTypeCode: '386' }); }
  static buildSmanjenje(data: any) { return this.build({ ...data, InvoiceTypeCode: '381', smerDokumenta: data.smerDokumenta || 'NEGATIVAN' }); }
  static buildPovecanje(data: any) { return this.build({ ...data, InvoiceTypeCode: '383' }); }

  static buildKonacniSaAvansom(data: any) { return this.build({ ...data, InvoiceTypeCode: '380' }); }
  static buildSmanjenjeAvansa(data: any) { return this.build({ ...data, InvoiceTypeCode: '381', smerDokumenta: 'NEGATIVAN' }); }
  static buildSmanjenjeUPeriodu(data: any) { return this.build({ ...data, InvoiceTypeCode: '381', smerDokumenta: 'NEGATIVAN', referentniRacun: data.referentniRacun || 'PERIOD' }); }
  static buildOslobodjena(data: any) { return this.build({ ...data, InvoiceTypeCode: '380', poreskaKategorija: 'E' }); }
  static buildFiskalizacijaProdaja(data: any) { return this.build({ ...data, InvoiceTypeCode: '380' }); }
}
