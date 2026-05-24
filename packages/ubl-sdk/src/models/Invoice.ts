export type SefPoreskaKategorija = 
  | 'S' | 'S20' | 'S10' 
  | 'AE' | 'AE20' | 'AE10' 
  | 'E' | 'Z' | 'R' | 'N' | 'OE' | 'G' | 'O';

export interface Party {
  pib: string;
  name: string;
  address?: string;
  city?: string;
  zip?: string;
  maticniBroj?: string;
  jbkjs?: string;
}

export interface InvoiceLine {
  id?: string;
  description: string;
  quantity: number;
  unitCode: string; // e.g., H87
  unitPrice: number;
  taxRate: number;
  taxCategory: SefPoreskaKategorija;
  taxExemptionReason?: string;
}

export interface Invoice {
  id: string;
  issueDate: string;
  dueDate: string;
  paymentDate?: string;
  deliveryDate?: string;
  invoicePeriod?: {
    startDate: string;
    endDate: string;
  };
  typeCode: '380' | '381' | '383' | '386';
  currency: string;
  documentDirection?: 'POZITIVAN' | 'NEGATIVAN';
  seller: Party;
  buyer: Party;
  lines: InvoiceLine[];
  note?: string;
  
  // Reference handling
  billingReference?: {
    id: string;
    date: string;
  };
  
  // Totals (can be calculated but often provided)
  taxTotal?: number;
  payableAmount?: number;
}
