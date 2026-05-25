import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isCI = !!process.env.CI;

export default defineConfig({
  resolve: {
    alias: {
      '@sef/shared': path.resolve(__dirname, './packages/shared'),
      '@dlbr/ubl-sdk': path.resolve(__dirname, './packages/ubl-sdk/src')
    }
  },
  test: {
    // Top-level konfiguracija umesto poolOptions
    isolate: true,
    threads: !isCI,
    fileParallelism: !isCI,
    maxWorkers: isCI ? 1 : undefined,
    
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
      wrangler: { configPath: 'packages/backend/wrangler.toml' },
      // Forsiramo lokalni mod za sve, posebno u CI
      remote: false,
      // Cloudflare plugin i dalje koristi specifičnu strukturu za svoje pool-ove
      poolOptions: {
        workers: {
          isolatedStorage: true,
          singleWorker: true,
          miniflare: {
            compatibilityDate: '2026-05-21',
            compatibilityFlags: ['nodejs_compat'],
            remote: false,
            // v4.38.0: Disable AI binding to avoid remote connection hang.
            // Tests that need AI must mock it manually.
            bindings: {
              AI: undefined
            }
          },
        },
      },
    }),
    ],
});