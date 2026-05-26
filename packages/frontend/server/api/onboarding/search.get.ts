import { defineEventHandler, getQuery } from 'h3';

export default defineEventHandler(async (event) => {
  const { q } = getQuery(event) as { q?: string };

  if (!q || q.trim().length < 2) {
    return { results: [] };
  }

  const env = event.context.cloudflare?.env;
  if (!env?.REGISTAR_DB) {
    return { results: [] };
  }

  try {
    // Sanitizujemo query za FTS5 — uklanjamo specijalne karaktere
    const sanitized = q.trim().replace(/['"*\-+]/g, ' ').trim();
    
    // FTS5 trigram pretraga — parcijalni match na naziv_firme i pib
    const { results } = await env.REGISTAR_DB.prepare(`
      SELECT s.pib, s.naziv_firme, s.maticni_broj, s.status
      FROM sef_kompanije s
      JOIN sef_kompanije_fts fts ON s.rowid = fts.rowid
      WHERE sef_kompanije_fts MATCH ?
      LIMIT 10
    `).bind(`${sanitized}*`).all();

    return { results: results || [] };

  } catch (err: any) {
    // Fallback: LIKE pretraga ako FTS5 ne radi
    try {
      const { results } = await env.REGISTAR_DB.prepare(`
        SELECT pib, naziv_firme, maticni_broj, status
        FROM sef_kompanije
        WHERE naziv_firme LIKE ? OR pib LIKE ?
        LIMIT 10
      `).bind(`%${q}%`, `%${q}%`).all();

      return { results: results || [] };
    } catch {
      return { results: [] };
    }
  }
});
