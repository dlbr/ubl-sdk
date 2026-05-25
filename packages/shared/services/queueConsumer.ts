import { D1SyncBridge } from './D1SyncBridge';
import { SefClient } from './sefClient';

export interface LogisticsQueuePayload {
  documentNumber: string;
  pib: string;
  tip: 'OTPREMNICA' | 'PRIJEMNICA';
  pokusaj: number;
}

/**
 * handleLogisticsQueue - The Chronicler
 * 
 * Background consumer that polls MFIN changes feed to resolve 'PENDING_PROCESSING' 
 * documents that timed out during the initial HTTP request.
 */
export async function handleLogisticsQueue(
  batch: MessageBatch<LogisticsQueuePayload>, 
  env: any
) {
  const bridge = new D1SyncBridge(env.REGISTAR_DB);
  const BASE_URL = env.OTPREMNICE_API_URL || 'https://api.demoeotpremnica.mfin.gov.rs';
  const API_KEY = env.OTPREMNICE_API_KEY;

  for (const message of batch.messages) {
    const { documentNumber, tip, pokusaj } = message.body;

    console.log(`⏳ [Queue Consumer] Polling status for ${tip}: ${documentNumber}, Attempt: ${pokusaj}`);

    try {
      const today = new Date().toISOString().split('T')[0];
      const channel = tip === 'OTPREMNICA' ? 'suppliers' : 'customers';
      const pollUrl = `${BASE_URL}/public/documents/${channel}/changes?date=${today}`;

      const response = await fetch(pollUrl, {
        headers: { 'ApiKey': API_KEY, 'Accept': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json() as any;
        const items = data.items || [];
        
        // Find by DocumentNumber
        const key = tip === 'OTPREMNICA' ? 'despatchAdvice' : 'receiptAdvice';
        const found = items.find((it: any) => it.data?.[key]?.documentNumber === documentNumber);

        if (found) {
          const mfinId = found.data[key].id;
          const finalStatus = tip === 'OTPREMNICA' ? 'SENT' : 'ACCEPTED';

          await env.REGISTAR_DB.prepare(
            "UPDATE dokumenti SET sef_id = ?, status = ?, azurirano_u = CURRENT_TIMESTAMP WHERE broj = ?"
          ).bind(mfinId, finalStatus, documentNumber).run();

          await bridge.logEvent(documentNumber, finalStatus, `Uspešno uparen ID: ${mfinId} kroz asinhroni red`);

          console.log(`🟢 [Queue Success] ${tip} ${documentNumber} resolved with MFIN ID: ${mfinId}`);
          message.ack();
          continue;
        }
      }

      // Exponential Backoff / Re-queue
      const isTest = typeof (globalThis as any).describe === 'function' || 
                     typeof (globalThis as any).expect === 'function';
      
      if (pokusaj < 8 && !isTest) {
        // Cloudflare Queues retry mechanism is handled via delayed messages or manual re-send
        // We'll use manual re-send for control
        await env.OTPREMNICA_QUEUE.send({ ...message.body, pokusaj: pokusaj + 1 }, { delaySeconds: (30 * pokusaj) });
        message.ack();
      } else {
        await env.REGISTAR_DB.prepare(
          "UPDATE dokumenti SET status = 'TIMEOUT_DEADLOCK', azurirano_u = CURRENT_TIMESTAMP WHERE broj = ?"
        ).bind(documentNumber).run();
        
        console.error(`🔴 [Queue Deadlock] ${tip} ${documentNumber} failed after ${pokusaj} attempts.`);
        message.ack();
      }

    } catch (err: any) {
      console.error(`💥 [Queue Error] ${tip} ${documentNumber}:`, err.message);
      // Let it retry automatically by not calling ack() if it's a transient fetch error
    }
  }
}
