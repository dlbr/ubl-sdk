import { describe, it, expect, vi, beforeEach } from 'vitest';
import inboundWorker from '../src/inbound';

// Mock PostalMime
vi.mock('postal-mime', () => {
  return {
    default: function() {
      return {
        parse: vi.fn().mockImplementation(async (raw: any) => {
          if (raw === 'MOCK_XML_RAW') {
            return {
              subject: 'Novi račun',
              attachments: [{
                filename: 'faktura.xml',
                content: new TextEncoder().encode(`<?xml version="1.0" encoding="utf-8"?><Invoice><ID>XML-123</ID><AccountingSupplierParty><Party><PartyTaxScheme><CompanyID>RS123456789</CompanyID></PartyTaxScheme><PartyLegalEntity><RegistrationName>Test Prodavac</RegistrationName></PartyLegalEntity></Party></AccountingSupplierParty><LegalMonetaryTotal><PayableAmount>1000.00</PayableAmount></LegalMonetaryTotal></Invoice>`)
              }]
            };
          }
          if (raw === 'MOCK_REPLY_RAW') {
            return {
              subject: 'Re: eFaktura [FKT-123]',
              text: 'Ovo je u redu, prihvatam račun.'
            };
          }
          return { subject: '', text: '', attachments: [] };
        })
      };
    }
  };
});

describe('📥 Inbound Email Worker - Parser i AI', () => {
  let mockDb: any;
  let mockAi: any;
  let mockQueue: any;
  let mockDoNamespace: any;

  beforeEach(() => {
    mockDb = {
      prepare: vi.fn().mockReturnThis(),
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true }),
      first: vi.fn().mockResolvedValue({ status: 'SENT' })
    };

    mockAi = {
      run: vi.fn().mockResolvedValue({ result: 'APPROVED' })
    };

    mockQueue = {
      send: vi.fn().mockResolvedValue(undefined)
    };

    mockDoNamespace = {
      idFromName: vi.fn().mockReturnValue('mock-id'),
      get: vi.fn().mockReturnValue({
        fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true })))
      })
    };
  });

  it('🟢 Treba uspešno da parsira prosleđeni UBL XML i sačuva ga u D1', async () => {
    const mockMessage = {
      to: 'pib100000001@inbox.tvoj-sef.rs',
      raw: 'MOCK_XML_RAW'
    };

    await inboundWorker.email(mockMessage, { 
      REGISTAR_DB: mockDb, 
      AI: mockAi,
      INVOICE_STATE: mockDoNamespace,
      WEBHOOK_QUEUE: mockQueue
    } as any, {} as any);

    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO ulazni_troskovi'));
    expect(mockQueue.send).toHaveBeenCalledWith(expect.objectContaining({
      event: 'invoice.received',
      pibKupca: '100000001'
    }));
  });

  it('🧠 Treba uspešno da prepozna nameru APPROVED preko AI-a', async () => {
    const mockMessage = {
      to: 'odgovori@tvoj-sef.rs',
      raw: 'MOCK_REPLY_RAW'
    };

    await inboundWorker.email(mockMessage, { 
      REGISTAR_DB: mockDb, 
      AI: mockAi,
      INVOICE_STATE: mockDoNamespace,
      WEBHOOK_QUEUE: mockQueue
    } as any, {} as any);

    expect(mockAi.run).toHaveBeenCalled();
    expect(mockDoNamespace.idFromName).toHaveBeenCalledWith('FKT-123');
  });
});
