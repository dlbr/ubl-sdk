import { defineEventHandler } from 'h3';
import { proxyToBackend } from '../../utils/proxy';

export default defineEventHandler(async (event) => {
  return await proxyToBackend(event, '/api/dashboard/config', {
    method: 'POST',
    body: JSON.stringify({ status_pretplate: 'U_OTKAZNOM_ROKU' })
  });
});
