import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
    }),
  ],
  // v4.3.5: Move poolOptions to top-level for Vitest 4.x compatibility
  poolOptions: {
    workers: {
      singleWorker: true, 
      miniflare: {
        compatibilityDate: '2026-05-21',
      }
    }
  },
  test: {
    include: [
      'worker/**/*.{test,spec}.ts', 
      'server/**/*.{test,spec}.ts', 
      'packages/**/*.{test,spec}.ts', 
      'test/**/*.{test,spec}.ts'
    ],
    reporters: ['default', 'hanging-process'],
    testTimeout: 30000,
    teardownTimeout: 10000,
    forceRerunTriggers: ['**/wrangler.toml'],
  }
});
