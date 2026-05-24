import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

const isCI = !!process.env.CI;

export default defineConfig({
  test: {
    // Top-level konfiguracija umesto poolOptions
    isolate: true,
    threads: true,
    singleThread: true, // Direktno ovde, sada je top-level
    
    include: [
      'worker/**/*.{test,spec}.ts', 
      'server/**/*.{test,spec}.ts', 
      'packages/**/*.{test,spec}.ts', 
      'test/**/*.{test,spec}.ts'
    ],
    setupFiles: ['./test/vitest-setup.ts'],
    globalSetup: ['./test/global-setup.ts'],
    reporters: ['default', 'hanging-process'],
    testTimeout: 60000,
    hookTimeout: 30000,
    teardownTimeout: 20000,
    },
    plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      // Cloudflare plugin i dalje koristi specifičnu strukturu za svoje pool-ove
      poolOptions: {
        workers: {
          isolatedStorage: true,
          singleWorker: true,
          miniflare: {
            compatibilityDate: '2026-05-21',
            compatibilityFlags: ['nodejs_compat']
          },
        },
      },
    }),
    ],
});