// test/vitest-setup.ts
import { afterAll, vi } from 'vitest';

// 🛡️ Globalni Mock za WASM module (Satori / OgEngine) da ne pucaju testovi
vi.mock('@sef/shared', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    OgEngine: {
      generatePng: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]))
    }
  };
});

vi.mock('satori', () => ({
  default: vi.fn().mockResolvedValue('<svg></svg>')
}));

afterAll(async () => {
  console.log("🧼 [Čisti Teardown] Oslobađam resurse i gasim aktivne agente...");

  // 1. Likvidiramo sve aktivne tajmere i mock-ove
  vi.clearAllTimers();
  vi.restoreAllMocks();

  // 2. Eksplicitno sugerišemo V8 engine-u da izvrši sakupljanje smeća
  if (globalThis.gc) {
    globalThis.gc();
  }
});
