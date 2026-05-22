export class Retriever {
  static async pullInvoice(env: any, invoiceId: string) {
    const meta = await env.PORESKI_KV.get(`status:${invoiceId}`, 'json') as any;
    if (!meta || !meta.r2Key) {
      throw new Error(`Faktura ${invoiceId} nije pronađena u indeksu.`);
    }

    const object = await env.SEF_UBL_ARHIVA.get(meta.r2Key);
    if (!object) {
      throw new Error(`Faktura ${invoiceId} nije pronađena u R2 arhivu.`);
    }

    return await object.text();
  }
}
