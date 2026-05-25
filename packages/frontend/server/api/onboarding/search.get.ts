import { defineEventHandler, getQuery } from 'h3';
import { proxyToBackend } from '../../utils/proxy';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  return await proxyToBackend(event, `/api/onboarding/search?q=${query.q}`);
});
