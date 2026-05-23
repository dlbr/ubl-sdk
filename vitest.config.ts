import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
  test: {
    pool: 'threads',
    threads: {
      singleThread: true,
      isolate: false,
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
  },
  plugins: [
    cloudflareTest({
      wrangler: { 
        configPath: './wrangler.toml',
        // Force local execution in CI to avoid "must be logged in" error
        mode: process.env.CI ? 'local' : 'remote' 
      },
    }),
  ],
});
