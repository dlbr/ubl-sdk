import { defineEventHandler, getQuery } from 'h3';

export default defineEventHandler(async (event) => {
  const env = event.context.cloudflare?.env;
  if (!env?.SEF_API) return { error: 'SERVICE_UNAVAILABLE' };
  
  const { date } = getQuery(event);
  if (!date) return { error: 'MISSING_DATE' };

  // Pozivamo RPC metod na backendu
  return env.SEF_API.getKursnaListaHistorical(date as string);
});
