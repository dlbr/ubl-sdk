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
}

export interface DespatchAdvice {
  id: string;
  issueDate: string;
  issueTime?: string;
  note?: string[];
  
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
