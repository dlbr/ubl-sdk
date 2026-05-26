import { defineEventHandler, readBody, createError } from 'h3';

export default defineEventHandler(async (event) => {
  const env = event.context.cloudflare?.env;
  const session = event.context.session;
  if (!session?.klijentId) throw createError({ statusCode: 401 });
  const body = await readBody(event);
  return env.SEF_API.receivePrijemnica(session.klijentId, body);
});
