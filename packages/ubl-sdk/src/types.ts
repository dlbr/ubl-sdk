export type SefPoreskaKategorija = 
  | 'S20'  // Standardno 20%
  | 'S10'  // Standardno 10%
  | 'AE20' // Obrnuti obračun 20%
  | 'AE10' // Obrnuti obračun 10%
  | 'E'    // Oslobođeno bez prava na odbitak
  | 'Z'    // Nulta stopa (Sa pravom na odbitak)
  | 'R'    // Oslobođeno sa pravom na odbitak / specifično
  | 'N';   // Anuliranje / Specifični režimi

export interface BaseInvoiceData {
  broj: string;
  pibProdavca: string;
  pibKupca: string;
  brojRacunaProdavca?: string;
  nazivProdavca?: string;
  nazivKupca?: string;
  maticniBrojProdavca?: string;
  maticniBrojKupca?: string;
  adresaProdavca?: string;
  gradProdavca?: string;
  postanskiBrojProdavca?: string;
  adresaKupca?: string;
  gradKupca?: string;
  postanskiBrojKupca?: string;
  note?: string;
  datumIzdavanja?: string;
  datumDospeca?: string;
  datumPrometa?: string;
  valuta?: string;
  poreskaKategorija?: SefPoreskaKategorija | string;
  pdvStopa?: number;
  smerDokumenta?: 'POZITIVAN' | 'NEGATIVAN';
  tipDokumenta?: '380' | '386' | '381' | '383';
  brojNarudzbenice?: string;
  brojUgovora?: string;
  jbkjs?: string;
  buyerReference?: string;
  avansneReference?: {
    brojAvansnogRacuna: string;
    idSefAvansa: string;
    iznosUmanjenja: number;
  }[];
}

export interface StandardnaData extends BaseInvoiceData {
  osnovica: number;
  pdv: number;
  pdvStopa?: number;
  item_name?: string;
  sifraOslobodjenja?: string;
  zakonskiClan?: string;
}

export interface PojedinacnaEeoData {
  poreskiPeriod: string; // Format: 'YYYY-MM'
  internalInvoiceNumber?: string;
  osnovicaOpsta: number;
  pdvOpsta: number;
  osnovicaPosebna: number;
  pdvPosebna: number;
  isCancellation?: boolean; // Za Poništavanje
  relatedInternalNumber?: string; // Veza sa prethodnom evidencijom
}

export interface AvansData extends BaseInvoiceData {
  osnovica: number;
  pdv: number;
}
// etc... ensure everything starts with export keyword.


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
  zakonskiClan?: string;
}

export interface ZbirniEeoData {
  poreskiPeriod: string;
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
  gradevinarstvoPorez?: number;
}

export interface JavnaNabavkaData extends BaseInvoiceData {
  iznos: number;
  brojUgovora: string;
  jbkjs: string;
}

export interface PopustData extends BaseInvoiceData {
  iznosPrePopusta: number;
  popustIznos: number;
}

export interface PrilogData extends BaseInvoiceData {
  osnovica: number;
  pdv: number;
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
  brojRacunaProdavca?: string;
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

export interface ValidationOptions {
  mode?: 'B2B' | 'B2G';
  strict?: boolean;
}
