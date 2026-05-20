import * as v from 'valibot';
import type { Handler, PicoContext } from './router';

// Ekstenzija konteksta koja garantuje strogo tipiziran payload unutar same rute
export type ValidatedContext<Env, TSchema extends v.BaseSchema<any, any, any>> = PicoContext<Env> & {
  validJson: v.InferOutput<TSchema>;
};

export function validateJson<Env, TSchema extends v.BaseSchema<any, any, any>>(
  schema: TSchema,
  handler: (c: ValidatedContext<Env, TSchema>) => Response | Promise<Response>
): Handler<Env> {
  return async (ctx: PicoContext<Env>): Promise<Response> => {
    // 1. Defanzivna provera: Provera Content-Type zaglavlja
    const contentType = ctx.req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return new Response(JSON.stringify({
        success: false,
        error: "Nevalidan Content-Type. Očekuje se application/json."
      }), { status: 415, headers: { 'content-type': 'application/json' } });
    }

    try {
      // Kloniramo zahtev da ne bismo potrošili body stream trajno pre DO-a ako zatreba
      const rawJson = await ctx.req.clone().json();
      
      // 2. Izvršavanje Valibot validacije
      const result = v.safeParse(schema, rawJson);

      if (!result.success) {
        // 3. Ekstrakcija i normalizacija grešaka sa bezbednim fallback-om
        const formatiraneGreske = result.issues.map(issue => ({
          polje: issue.path ? issue.path.map((p: any) => p.key).join('.') : 'root',
          poruka: issue.message
        }));

        return new Response(JSON.stringify({
          success: false,
          error: "Validacija podataka nije uspela pre slanja na SEF.",
          details: formatiraneGreske
        }), { status: 422, headers: { 'content-type': 'application/json' } });
      }

      // 4. ISPRAVLJENO: Mutiramo postojeći ctx umesto destukturiranja ({ ...ctx })
      // Na ovaj način čuvamo sve getter-e, setter-e i `this` kontekst unutar Pico ruter metoda.
      const validatedCtx = ctx as ValidatedContext<Env, TSchema>;
      validatedCtx.validJson = result.output;

      return await handler(validatedCtx);
    } catch (e) {
      return new Response(JSON.stringify({
        success: false,
        error: "Malformisan JSON payload. Parsiranje nije uspelo."
      }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
  };
}

/**
 * Forenzička verifikacija srpskog PIB-a koristeći ISO 7064, MOD 11,10 algoritam.
 * Garantuje matematičku ispravnost kontrolnog broja i imun je na tipove podataka.
 */
export function isValidPib(pib: string | number): boolean {
  // 1. Defanzivna konverzija i čišćenje od belina ili prefiksa (npr. "RS100000010")
  const pibStr = String(pib).replace(/[^0-9]/g, '');

  // 2. Striktna provera dužine i numeričkog sastava
  if (pibStr.length !== 9) {
    return false;
  }

  // 3. Modul 11,10 računica
  let checksum = 10;
  for (let i = 0; i < 8; i++) {
    const digit = parseInt(pibStr.charAt(i), 10);
    checksum = (checksum + digit) % 10;
    if (checksum === 0) {
      checksum = 10;
    }
    checksum = (checksum * 2) % 11;
  }

  const calculatedControlDigit = (11 - checksum) % 10;
  const actualControlDigit = parseInt(pibStr.charAt(8), 10);

  return actualControlDigit === calculatedControlDigit;
}