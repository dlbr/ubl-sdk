import { describe, it, expect, vi } from 'vitest';
import { EmailService } from '../services/EmailService';

describe('🛡️ EmailService — Cloudflare Native Sending Audit', () => {
  it('treba uspešno da pošalje mejl kada je binding prisutan', async () => {
    const mockEmailBinding = {
      send: vi.fn().mockResolvedValue(undefined)
    };

    const mockEnv = {
      EMAIL: mockEmailBinding
    };

    const message = {
      to: 'kupac@test.com',
      from: 'no-reply@sef-bridge.rs',
      subject: 'Test eFaktura',
      text: 'Ovo je test poruka.'
    };

    const result = await EmailService.send(mockEnv, message);

    expect(result.success).toBe(true);
    expect(mockEmailBinding.send).toHaveBeenCalledWith(message);
  });

  it('treba da vrati grešku ako binding nedostaje', async () => {
    const mockEnv = {};
    const message = {
      to: 'test@test.com',
      from: 'test@test.com',
      subject: 'Test',
      text: 'Test'
    };

    const result = await EmailService.send(mockEnv, message);

    expect(result.success).toBe(false);
    expect(result.error).toContain('binding nije konfigurisan');
  });

  it('treba uspešno da generiše i pošalje eFakturu sa prilogom', async () => {
    const mockEmailBinding = {
      send: vi.fn().mockResolvedValue(undefined)
    };

    const mockEnv = {
      EMAIL: mockEmailBinding
    };

    const pdfBuffer = new TextEncoder().encode('Fake PDF Content').buffer;
    
    const result = await EmailService.sendInvoice(
      mockEnv,
      'kupac@example.com',
      'FKT-2026-001',
      pdfBuffer
    );

    expect(result.success).toBe(true);
    expect(mockEmailBinding.send).toHaveBeenCalled();
    
    const sentMsg = mockEmailBinding.send.mock.calls[0][0];
    expect(sentMsg.to).toBe('kupac@example.com');
    expect(sentMsg.attachments).toHaveLength(1);
    expect(sentMsg.attachments[0].name).toBe('eFaktura_FKT-2026-001.pdf');
  });
});
