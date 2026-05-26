import { SefClient } from '../packages/shared/services/sefClient.ts';

async function verify() {
  const apiKey = process.env.SEF_API_KEY || process.env.STAGING_SEF_API_KEY;

  if (!apiKey) {
    console.error('🚨 SECURITY CHECK: SEF_API_KEY ili STAGING_SEF_API_KEY nije definisan u okruženju!');
    process.exit(1);
  }

  const client = new SefClient({
    apiKey,
    baseUrl: process.env.SEF_BASE_URL || 'https://demoefaktura.mfin.gov.rs',
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
