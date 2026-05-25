import { defineEventHandler, readBody, getHeader } from 'h3';
import { proxyToBackend } from '../../utils/proxy';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const authHeader = getHeader(event, 'Authorization');

  return await proxyToBackend(event, '/api/admin/renew-subscription', {
    method: 'POST',
    headers: { 'Authorization': authHeader || '' },
    body: JSON.stringify(body)
  });
});
