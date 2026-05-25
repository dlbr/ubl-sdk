import { defineEventHandler, getQuery } from 'h3';
import { proxyToBackend } from '../../utils/proxy';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const searchParams = new URLSearchParams(query as any).toString();
  return await proxyToBackend(event, `/api/logistika/documents?${searchParams}`);
});
