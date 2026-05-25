import { defineEventHandler } from 'h3';
import { proxyToBackend } from '../../utils/proxy';

export default defineEventHandler(async (event) => {
  return await proxyToBackend(event, '/api/dashboard/stats');
});
