import { defineEventHandler } from 'h3';
import { proxyToBackend } from '../../../utils/proxy';

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id;
  return await proxyToBackend(event, `/api/dokumenti/chain/${id}`);
});
