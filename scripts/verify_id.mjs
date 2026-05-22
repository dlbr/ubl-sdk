import { SefClient } from './shared/services/sefClient';

async function verify() {
  const client = new SefClient({
    apiKey: '84242636-e63d-4c3e-862a-8924e23bc24e',
    baseUrl: 'https://demoefaktura.mfin.gov.rs',
    environment: 'sandbox'
  });

  const id = 3556253;
  console.log(`🔍 Proveravam stvarni status za SalesInvoiceId: ${id}...`);
  const status = await client.getInvoiceStatus(id);
  
  if (status) {
    console.log('✅ Pronađen dokument na SEF-u:');
    console.log(`   Broj: ${status.InvoiceNumber}`);
    console.log(`   Status: ${status.InvoiceStatus}`);
    console.log(`   SalesInvoiceId: ${status.SalesInvoiceId}`);
  } else {
    console.log('❌ Dokument NIJE pronađen ili je API odbio pristup.');
  }
}

verify();
