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
  test: {
    // 🛡️ NO ISOLATION + SINGLE THREAD to prevent esbuild deadlocks
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
        isolate: false,
      }
    },
    include: [
      'worker/**/*.{test,spec}.ts', 
      'server/**/*.{test,spec}.ts', 
      'packages/**/*.{test,spec}.ts', 
      'test/**/*.{test,spec}.ts'
    ],
    setupFiles: ['./test/vitest-setup.ts'],
    reporters: ['default', 'hanging-process'],
    testTimeout: 60000,
    teardownTimeout: 10000,
  }
});
