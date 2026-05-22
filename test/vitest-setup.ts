// test/vitest-setup.ts
import { afterAll, vi } from 'vitest';

afterAll(async () => {
  console.log("🧼 [Čisti Teardown] Oslobađam resurse i gasim aktivne agente...");

  // 1. Likvidiramo sve aktivne tajmere i mock-ove
  vi.clearAllTimers();
  vi.restoreAllMocks();

  // 2. Eksplicitno sugerišemo V8 engine-u da izvrši sakupljanje smeća
  if (globalThis.gc) {
    globalThis.gc();
  }

  // 3. 🛡️ STOP ALARMU: Ne pozivamo process.exit(). Puštamo Vitest 4 pool 
  // da sam ugasi Miniflare nit. Koristimo --forceExit u CLI komandi.
});
