import type { Party } from './Invoice.js';

export interface DespatchLine {
  id: string;
  itemID?: string;
  name: string;
  deliveredQuantity: number;
  unitCode: string;
  outstandingQuantity?: number;
  outstandingReason?: string;
  orderReference?: {
    id: string;
    lineID?: string;
  };
  exciseCategory?: string; // AKCIZE.KATEGORIJA
  itemProperties?: Record<string, string>; // e.g. "GUSTINA"
}

export interface DespatchAdvice {
  id: string;
  issueDate: string;
  issueTime?: string;
  note?: string[];
  
  // Serbian Extensions (SrbDtExt)
  shipmentMethod?: '1' | '2' | '3' | '4' | '5';
  thirdPartyGoodsId?: string;
  isReturn?: boolean;
  offlineZinNumber?: string;
  
  orderReference?: {
    id: string;
    issueDate?: string;
  };
  
  despatchAddress?: {
    street?: string;
    city?: string;
    zip?: string;
    countryCode?: string;
  };
  
  deliveryAddress?: {
    street?: string;
    city?: string;
    zip?: string;
    countryCode?: string;
  };
  
  carrier?: Party;
  
  seller: Party;
  buyer: Party;
  lines: DespatchLine[];
}
