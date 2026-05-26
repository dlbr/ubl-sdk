import { defineEventHandler, createError } from 'h3';

export default defineEventHandler(async (event) => {
  const env = event.context.cloudflare?.env;
  if (!env?.SEF_API) throw createError({ statusCode: 503 });
  return env.SEF_API.getKursnaLista();
});
