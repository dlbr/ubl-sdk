import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
  poolOptions: {
    workers: {
      singleWorker: true,
      miniflare: {
        compatibilityDate: '2026-05-21',
      },
    },
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
    }),
  ],
  // 🛡️ VITEST 4 REWORK: poolOptions is now a top-level property of the main config
  
  test: {
    include: [
      'worker/**/*.{test,spec}.ts', 
      'server/**/*.{test,spec}.ts', 
      'packages/**/*.{test,spec}.ts', 
      'test/**/*.{test,spec}.ts'
    ],
    setupFiles: ['./test/vitest-setup.ts'],
    reporters: ['default', 'hanging-process'],
    testTimeout: 30000,
    teardownTimeout: 5000,
  }
});
