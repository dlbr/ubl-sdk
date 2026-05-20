import * as v from 'valibot';

// Pojedinačni red u evidenciji prethodnog poreza (Deo 8)
export const PopdvDeo8RecordSchema = v.object({
  redniBroj: v.number(),
  pibDobavljaca: v.pipe(v.string(), v.regex(/^\d{9}$/, "PIB mora imati tačno 9 cifara")),
  nazivDobavljaca: v.string(),
  brojRacuna: v.string(),
  datumRacuna: v.string(), // YYYY-MM-DD
  iznosBezPdv: v.number(), // Osnovica
  iznosPdv20: v.number(),  // PDV po opštoj stopi
  iznosPdv10: v.number(),  // PDV po posebnoj stopi
  iznosKojiSeNeOdbija: v.number(),
});

export const PopdvDeo3RecordSchema = v.object({
  redniBroj: v.number(),
  pibKupca: v.pipe(
    v.string(),
    // Kupac može biti i strani entitet (bez 9 cifara) ili fizičko lice, pa je validacija labavija nego za domaće dobavljače
    v.transform(val => val.replace(/[^0-9A-Za-z]/g, ''))
  ),
  nazivKupca: v.string(),
  brojRacuna: v.string(),
  datumRacuna: v.string(),
  osnovica20: v.number(),
  pdv20: v.number(),
  osnovica10: v.number(),
  pdv10: v.number(),
  oslobodjenPromet: v.number(), // Iznos prometa bez PDV-a po članovima 24 i 25
  tipKupca: v.picklist(['OBVEZNIK', 'NEOBVEZNIK']) // Za interno razvrstavanje na 3.1 i 3.2
});

// Validacija za korekciju prava na odbitak
export const PopdvCorrectionSchema = v.object({
  taxCategoryCode: v.string(), // npr. 'S' ili 'AE'
  nonDeductibleAmount: v.pipe(
    v.number(),
    v.minValue(0, "Iznos koji se ne odbija ne može biti negativan")
  ),
  operater: v.pipe(v.string(), v.minLength(1, "Identitet operatera je obavezan")),
  razlog: v.optional(v.string())
});

export type PopdvCorrection = v.InferOutput<typeof PopdvCorrectionSchema>;

// Glavni kontejner koji zahteva državni API
export const PopdvSubmitSchema = v.object({
  poreskiPeriod: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}$/, "Format mora biti YYYY-MM")), // npr. 2026-05
  pibObveznika: v.pipe(v.string(), v.regex(/^\d{9}$/)),
  deo3: v.array(PopdvDeo3RecordSchema),
  deo8: v.array(PopdvDeo8RecordSchema),
});

export type PopdvSubmitData = v.InferOutput<typeof PopdvSubmitSchema>;
