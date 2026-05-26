import { defineEventHandler, getQuery, createError } from 'h3';

export default defineEventHandler(async (event) => {
  const env = event.context.cloudflare?.env;
  const session = event.context.session;
  if (!session?.klijentId) throw createError({ statusCode: 401 });

  const query = getQuery(event);
  const searchParams = new URLSearchParams(query as any).toString();
  return env.SEF_API.getLogistikaDocuments(session.klijentId, searchParams);
});
