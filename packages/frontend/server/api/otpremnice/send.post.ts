import { defineEventHandler, readBody } from 'h3';
import { proxyToBackend } from '../../utils/proxy';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  return await proxyToBackend(event, '/api/otpremnice/send', {
    method: 'POST',
    body: JSON.stringify(body)
  });
});
