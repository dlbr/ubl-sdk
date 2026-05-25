import { SefClient } from '../packages/shared/services/sefClient';

/**
 * Forenzički dokaz o uspešnoj registraciji fakture na državni Demo SEF.
 * Koristi poslednji validni InvoiceId dobijen iz testova: 3556253
 */
async function dokaz() {
  const client = new SefClient({
    apiKey: '93fcff50-939f-4d91-abc8-f2774c389a14',
    baseUrl: 'https://demoefaktura.mfin.gov.rs',
    environment: 'sandbox'
  });

  const invoiceId = 3556253;
  console.log(`🔎 Forenzička provera za SalesInvoiceId: ${invoiceId}...`);
  
  try {
    const status = await client.getInvoiceStatus(invoiceId);
    console.log('✅ DOKAZ PRONAĐEN NA DRŽAVNOM SERVERU:');
    console.log(JSON.stringify(status, null, 2));
  } catch (err) {
    console.error('❌ DOKAZ NIJE PRONAĐEN. API je odbio pristup ili ID ne postoji.');
  }
}

dokaz();
