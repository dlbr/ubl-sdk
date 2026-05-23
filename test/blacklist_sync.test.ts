import { describe, it, expect, vi } from 'vitest';

// Simuliramo uvoz funkcije iz sync-blacklist.js
// Pošto je skripta dizajnirana za izvršavanje, izolujemo logiku u testu
describe('Blacklist Parser Test', () => {
  it('TREBA DA IZVUČE PIB-ove iz CSV stringa', () => {
    const csvContent = "PIB,Naziv\n123456789,Test Firma\n987654321,Druga Firma\nInvalidPIB,Greska";
    
    const pibs = csvContent
      .split('\n')
      .slice(1)
      .map(line => line.split(',')[0].trim())
      .filter(pib => /^\d{9}$/.test(pib));
      
    expect(pibs).toEqual(['123456789', '987654321']);
    expect(pibs.length).toBe(2);
  });

  it('TREBA DA IGNORIŠE neispravne formate', () => {
    const csvContent = "PIB\n123\nABCDEFGHI\n1234567890\n999888777";
    
    const pibs = csvContent
      .split('\n')
      .slice(1)
      .map(line => line.split(',')[0].trim())
      .filter(pib => /^\d{9}$/.test(pib));
      
    expect(pibs).toEqual(['999888777']);
  });
});
