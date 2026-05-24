import type { Party } from './Invoice.js';

export interface ReceiptLine {
  id: string;
  receivedQuantity: number;
  unitCode: string;
  rejectedQuantity?: number;
  rejectReason?: string;
  shortQuantity?: number;
  oversupplyQuantity?: number;
  itemName: string;
  itemIdentification?: string;
  despatchLineReference?: {
    id: string;
  };
}

export interface ReceiptAdvice {
  id: string;
  issueDate: string;
  issueTime?: string;
  note?: string[];
  
  despatchDocumentReference?: {
    id: string;
    issueDate?: string;
  };
  
  orderReference?: {
    id: string;
    issueDate?: string;
  };

  seller: Party; // DespatchSupplierParty
  buyer: Party;  // DeliveryCustomerParty
  lines: ReceiptLine[];
}
