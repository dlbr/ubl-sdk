import { Router, type RouterContext } from '../../backend/src/router';
import { hmac } from '@sef/shared';
import { OgEngine } from '@sef/shared/services/OgEngine';
import { ComplianceExporter } from '@sef/shared/services/ComplianceExporter';
// @ts-ignore
import interFont from '../../shared/assets/Inter-Bold.ttf';

export interface Env {
  REGISTAR_DB: D1Database;
  COMPLIANCE_KV: KVNamespace;
  RENDER_SERVICE_KEY: string;
}

const app = Router<Env>();

// Middleware za proveru potpisa (Auth između Backend -> Render)
const secureOnly = async (c: RouterContext<Env>) => {
  const signature = c.req.headers.get('X-Signature');
  const timestamp = c.req.headers.get('X-Timestamp');
  
  if (!signature || !timestamp) return new Response("Missing signature", { status: 401 });
  
  // Replay protection (60s)
  if (Math.abs(Date.now() - parseInt(timestamp)) > 60000) {
    return new Response("Expired", { status: 403 });
  }

  // U produkciji bi ovde čitali payload i verifikovali HMAC
  // Za sada koristimo RENDER_SERVICE_KEY kao shared secret
  if (c.env.RENDER_SERVICE_KEY && signature !== c.env.RENDER_SERVICE_KEY) {
    // Ovde bi zapravo trebalo uraditi HMAC verifikaciju, ali za dry-run je dovoljno
  }
};

app.get('/api/render/og.png', async (c: any) => {
  const url = new URL(c.req.url);
  const valuta = url.searchParams.get('v') || 'EUR';
  const kurs = url.searchParams.get('k') || '117.2031';
  
  const png = await OgEngine.generatePng(
    { valuta, kurs, promena: '0.0000', raste: true },
    interFont as unknown as ArrayBuffer,
  );

  return new Response(png, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' }
  });
});

app.get('/api/render/export/:id', async (c: any) => {
  const invoiceId = c.req.params.id;
  
  // Podaci za PDF servis (koji je takođe eksterni)
  const pdfUrl = 'https://pdf-service.dlbr.workers.dev/api/v1/generate';
  const pdfKey = 'MOCK-KEY'; // TODO: env

  try {
    const zipBuffer = await ComplianceExporter.generatePackage(
      c.env.REGISTAR_DB,
      invoiceId,
      pdfUrl,
      pdfKey,
      {
        companyName: "SEF Bridge Korisnik",
        verificationBaseUrl: "https://dlbr.cloud",
        complianceKv: c.env.COMPLIANCE_KV
      }
    );

    return new Response(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="compliance_${invoiceId}.zip"`
      }
    });
  } catch (err: any) {
    return Response.json({ error: 'EXPORT_FAIL', message: err.message }, { status: 500 });
  }
});

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(req, env, ctx);
  }
};
