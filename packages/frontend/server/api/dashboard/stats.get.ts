import { defineEventHandler, createError } from 'h3';

export default defineEventHandler(async (event) => {
  const env = event.context.cloudflare?.env;
  const session = event.context.session;
  if (!session?.klijentId) throw createError({ statusCode: 401 });
  return env.SEF_API.getDashboardStats(session.klijentId);
});
