import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.{test,spec}.ts'],
    alias: {
      '@dlbr/ubl-sdk': new URL('./src/index.ts', import.meta.url).pathname
    },
    coverage: {
      provider: 'v8', // Koristimo v8 engine (najbrži za Node.js)
      reporter: ['text', 'json', 'html'],
    },
  },
});
