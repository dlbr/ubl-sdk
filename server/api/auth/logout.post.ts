// /server/api/auth/logout.post.ts
import { defineEventHandler, deleteCookie, setHeaders, type H3Event } from 'h3';

export default defineEventHandler(async (event: H3Event) => {
  // 1. Uništavamo kolačić na nivou browsera (Strogo poštovanje __Host- specifikacije)
  deleteCookie(event, '__Host-sef_bridge_session', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/' // Obavezno ponoviti korensku putanju da bi browser prepoznao brisanje
  });

  // 2. OKLOP PROTIV KEŠIRANJA SESIJE: Primoravamo klijentski browser i intermediate proxy-je
  // da momentalno zaborave sve autorizovane podatke ovog zahteva
  setHeaders(event, {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  return { 
    success: true, 
    message: 'Sesija uspešno zatvorena. Kriptografski oklop na ivici je oslobođen.' 
  };
});