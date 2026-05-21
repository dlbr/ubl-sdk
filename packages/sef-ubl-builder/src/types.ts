export type SefPoreskaKategorija = 
  | 'S20'  // Standardno 20%
  | 'S10'  // Standardno 10%
  | 'AE20' // Obrnuti obračun 20%
  | 'AE10' // Obrnuti obračun 10%
  | 'E'    // Oslobođeno bez prava na odbitak
  | 'Z'    // Nulta stopa (Sa pravom na odbitak)
  | 'N';   // Anuliranje / Specifični režimi

export interface BaseInvoiceData {
  broj: string;
  pibProdavca: string;
  pibKupca: string;
  datumIzdavanja?: string;
  datumDospeca?: string;
  valuta?: string;
  poreskaKategorija?: SefPoreskaKategorija | string;
  smerDokumenta?: 'POZITIVAN' | 'NEGATIVAN';
  tipDokumenta?: '380' | '386' | '381';
  avansneReference?: {
    brojAvansnogRacuna: string;
    idSefAvansa: string;
    iznosUmanjenja: number;
  }[];
}

export interface PojedinacnaEeoData {
  poreskiPeriod: string;
  internalInvoiceNumber?: string;
  osnovicaOpsta: number;
  pdvOpsta: number;
  osnovicaPosebna: number;
  pdvPosebna: number;
}

export interface AvansData extends BaseInvoiceData {
  osnovica: number;
  pdv: number;
}

export interface KonacniData extends BaseInvoiceData {
  avansBroj: string;
  avansDatum: string;
  ukupnaOsnovica: number;
  ukupniPdv: number;
  odbitakAvansaSaPdv: number;
}

export interface StornoData extends BaseInvoiceData {
  referentniRacun: string;
  razlog: string;
  iznosZaSmanjenjeOsnovice: number;
  iznosZaSmanjenjePdv: number;
}

export interface PovecanjeData extends BaseInvoiceData {
  referentniRacun: string;
  datumReferentnog: string;
  iznosZaPovecanjeOsnovice: number;
  iznosZaPovecanjePdv: number;
}

export interface OslobodjenaData extends BaseInvoiceData {
  iznos: number;
  poreskaKategorija: string;
  sifraOslobodjenja: string;
  zakonskiClan?: string; // OKLOP: Obavezan tekstualni opis zakonskog člana
}

export interface ZbirniEeoData {
  poreskiPeriod: string; // npr. 2026-05
  osnovicaOpsta: number;
  pdvOpsta: number;
  osnovicaPosebna: number;
  pdvPosebna: number;
  oslobodjenBezPrava?: number;
}

export interface EppData {
  period: string;
  nabavkeOdObveznikaPdv: number;
  prethodniPorezOdObveznika: number;
  importPdvCarina: number;
  gradevinarstvoPorez?: number; // Član 10
}

export interface JavnaNabavkaData extends BaseInvoiceData {
  iznos: number;
  brojUgovora: string;
  jbkjs: string;
}

export interface PopustData extends BaseInvoiceData {
  iznosPrePopusta: number;
  popustIznos: number;
  pdvStopa: number;
}

export interface PrilogData extends BaseInvoiceData {
  ukupno: number;
  prilogIme: string;
  prilogBase64: string;
}

export interface ValutaData extends BaseInvoiceData {
  valuta: string;
  kurs: number;
  kursDatum: string;
  osnovicaRSD: number;
  pdvRSD: number;
  ukupnoValuta: number;
}

export interface FiskalizacijaData extends BaseInvoiceData {
  ukupno: number;
  pfrBrojevi: string[];
}

export interface KonacnaValutaData extends BaseInvoiceData {
  avansBroj: string;
  valuta: string;
  kurs: number;
  odbitakValuta: number;
  zaUplatuValuta: number;
}

export interface SmanjenjeAvansaData extends BaseInvoiceData {
  avansBroj: string;
  avansDatum: string;
  iznosSmanjenjaOsnovice: number;
  iznosSmanjenjaPdv: number;
}

export interface SmanjenjeUPerioduData extends BaseInvoiceData {
  periodOd: string;
  periodDo: string;
  opisKod?: string;
  iznosZaSmanjenjeOsnovice: number;
  iznosZaSmanjenjePdv: number;
}

export interface SmanjenjeViseFakturaData extends BaseInvoiceData {
  fakture: Array<{ id: string; datum: string }>;
  iznosZaSmanjenjeOsnovice: number;
  iznosZaSmanjenjePdv: number;
}
