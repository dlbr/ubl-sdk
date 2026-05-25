/**
 * Logistics SSoT Types (v4.50.0)
 * Synchronized with D1 Schema and MFIN UBL 2.1 Extensions
 */

export type LogisticsDocumentType = 'OTPREMNICA' | 'PRIJEMNICA' | '380' | '381' | '383' | '386';

export type LogisticsStatus = 
  | 'PENDING_PROCESSING' 
  | 'SENT' 
  | 'ACCEPTED' 
  | 'DISCREPANCY' 
  | 'CONFIRMED' 
  | 'REJECTED' 
  | 'TIMEOUT_DEADLOCK';

export interface Party {
  pib: string;
  name: string;
  address?: string;
  city?: string;
  maticniBroj?: string;
}

export interface LogisticsLine {
  id: string;
  name: string;
  quantity: number;
  receivedQuantity?: number;
  shortQuantity?: number;
  rejectedQuantity?: number;
  rejectReason?: string;
  unitCode: string;
  exciseCategory?: 'NAFTA' | 'DUVAN' | 'KAFA' | 'ALKOHOL' | 'NIKOTIN';
  itemProperties?: {
    GUSTINA?: string;
    [key: string]: any;
  };
}

export interface LogisticsDocument {
  id: string;
  sefId?: string;
  tip: LogisticsDocumentType;
  broj: string;
  pibProdavca: string;
  pibKupca: string;
  status: LogisticsStatus;
  issueDate: string;
  despatchDate?: string;
  amount?: number;
  parentId?: string;
  xmlBlob?: string;
  lines: LogisticsLine[];
  kreirano_u?: string;
}

export interface ReconciliationResult {
  stavka_otpremnice_id: string;
  artikal_naziv: string;
  poslata_kolicina: number;
  primljena_kolicina: number;
  odbijena_kolicina: number;
  gustina_otprema: number | null;
  gustina_prijem: number | null;
  kvantitativni_manjak: number;
  devijacija_gustine: number;
}

export interface ReconciliationDashboard {
  success: boolean;
  meta: {
    otpremnicaId: string;
    statusZastite: 'SECURE 🟢' | 'QUANTITY_DISCREPANCY 🟡' | 'EXCISE_BREACH 🔴';
    verifikovanoAt: string;
  };
  chain: {
    id: string;
    tip: string;
    status: string;
    kreirano_u: string;
  }[];
  stavke: ReconciliationResult[];
}
