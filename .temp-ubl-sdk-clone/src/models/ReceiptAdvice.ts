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
  exciseCategory?: string;
  itemProperties?: Record<string, string>;
}

export interface ReceiptAdvice {
  id: string;
  issueDate: string;
  issueTime?: string;
  note?: string[];
  
  // Serbian Extensions (SrbDtExt)
  shipmentMethod?: '1' | '2' | '3' | '4' | '5';
  thirdPartyGoodsId?: string;
  isReturn?: boolean;
  offlineZinNumber?: string;
  
  frameworkAgreementId?: string; // sbt:ExtDocuments -> cac:OriginatorDocumentReference
  contractId?: string;           // sbt:ExtDocuments -> cac:ContractDocumentReference
  
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
  carrier?: Party;
  lines: ReceiptLine[];
}
