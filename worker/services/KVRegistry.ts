export class KVRegistry {
  static async saveStatus(env: any, invoiceId: string, status: string, r2Key: string) {
    await env.PORESKI_KV.put(`status:${invoiceId}`, JSON.stringify({ status, r2Key, updatedAt: new Date().toISOString() }));
  }

  static async getStatus(env: any, invoiceId: string) {
    const data = await env.PORESKI_KV.get(`status:${invoiceId}`, 'json');
    return data;
  }
}
