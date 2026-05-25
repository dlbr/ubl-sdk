import { defineEventHandler } from 'h3';

export default defineEventHandler(async (event) => {
  if (event.context.session) {
    return { success: true, ...event.context.session };
  }
  return { success: false };
});
