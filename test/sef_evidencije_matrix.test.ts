import { describe, it, expect } from 'vitest';
import { SefUblBuilder } from '../packages/sef-ubl-builder/src/index';

describe('SEF Bridge v3 — EEO & EPP (Evidencije) Strukturni Audit', () => {

  it('EEO Provera: Zbirna evidencija obračuna mora imati ispravne sume i period', () => {
    const data = {
      poreskiPeriod: '2026-05',
      osnovica20: 100000,
      pdv20: 20000,
      osnovica10: 50000,
      pdv10: 5000,
      oslobodjenBezPrava: 10000
    };

    const xml = SefUblBuilder.buildZbirniEeo(data);

    expect(xml).toContain('<PoreskiPeriod>2026-05</PoreskiPeriod>');
    expect(xml).toContain('<OpstaStopa><Osnovica>100000.00</Osnovica><Pdv>20000.00</Pdv></OpstaStopa>');
    expect(xml).toContain('<PosebnaStopa><Osnovica>50000.00</Osnovica><Pdv>5000.00</Pdv></PosebnaStopa>');
    expect(xml).toContain('<OslobodjenBezPrava>10000.00</OslobodjenBezPrava>');
  });

  it('EPP Provera: Evidencija prethodnog poreza mora podržavati uvoz robe i lokalne nabavke', () => {
    const data = {
      period: '2026-05',
      nabavkeOdObveznikaPdv: 450000.00,
      prethodniPorezOdObveznika: 90000.00,
      importPdvCarina: 30000.00,
      gradevinarstvoPorez: 15000.00
    };

    const xml = SefUblBuilder.buildEpp(data);

    expect(xml).toContain('<Period>2026-05</Period>');
    expect(xml).toContain('<NabavkeLokalne><Osnovica>450000.00</Osnovica><Porez>90000.00</Porez></NabavkeLokalne>');
    expect(xml).toContain('<UvozRobe><Porez>30000.00</Porez></UvozRobe>');
    expect(xml).toContain('<Gradevinarstvo><Porez>15000.00</Porez></Gradevinarstvo>');
  });

  it('Generic Build: Mora prepoznati EEO i EPP tipove zapisa', () => {
    const eeoXml = SefUblBuilder.build({ TipZapisa: 'EEO', poreskiPeriod: '2026-05', osnovica20: 100, pdv20: 20, osnovica10: 0, pdv10: 0 });
    expect(eeoXml).toContain('<SummaryTaxEvidencis');

    const eppXml = SefUblBuilder.build({ TipZapisa: 'EPP', period: '2026-05', nabavkeOdObveznikaPdv: 100, prethodniPorezOdObveznika: 20, importPdvCarina: 0 });
    expect(eppXml).toContain('<PrethodniPorezEvidencija');
  });
});
