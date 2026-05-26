import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import fs from 'node:fs';

const isCI = !!process.env.CI;

// Load env variables from .dev.vars if it exists
try {
  const envPath = path.resolve(__dirname, './.dev.vars');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const index = trimmed.indexOf('=');
        if (index !== -1) {
          const key = trimmed.slice(0, index).trim();
          const val = trimmed.slice(index + 1).trim();
          if (key && val && !process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
} catch (e) {
  console.warn("Failed to load .dev.vars:", e);
}

let wranglerConfigPath = 'packages/backend/wrangler.toml';
try {
  const fullPath = path.resolve(__dirname, './packages/backend/wrangler.toml');
  if (fs.existsSync(fullPath)) {
    let toml = fs.readFileSync(fullPath, 'utf-8');
    // Strip [ai] binding blocks completely to prevent vitest-pool-workers from forcing remote proxy logins in local/CI runs
    toml = toml.replace(/\[ai\][^]*?binding\s*=\s*"AI"/gi, '');
    toml = toml.replace(/\[env\.production\.ai\][^]*?binding\s*=\s*"AI"/gi, '');
    
    const testTomlPath = path.resolve(__dirname, './packages/backend/wrangler.test.toml');
    fs.writeFileSync(testTomlPath, toml, 'utf-8');
    wranglerConfigPath = 'packages/backend/wrangler.test.toml';
    console.log("🛠️ Generated wrangler.test.toml without remote AI bindings for local/CI test stability.");
  }
} catch (e) {
  console.warn("Failed to generate wrangler.test.toml:", e);
}

export default defineConfig({
  resolve: {
    alias: {
      '@sef/shared': path.resolve(__dirname, './packages/shared'),
      '@dlbr/ubl-sdk': path.resolve(__dirname, './packages/ubl-sdk/src'),
      'satori': path.resolve(__dirname, './test/mocks/satori-mock.ts'),
      'yoga-layout': path.resolve(__dirname, './test/mocks/satori-mock.ts')
    }
  },
  test: {
    env: {
      STAGING_SEF_API_KEY: process.env.STAGING_SEF_API_KEY || "mock-local-key",
      SESSION_SECRET: process.env.SESSION_SECRET || "mock-secret"
    },
    isolate: true,
    threads: !isCI,
    fileParallelism: !isCI,
    maxWorkers: isCI ? 1 : undefined,
    pool: 'threads',
    poolOptions: {
      threads: {
        isolate: true,
        execArgv: ['--max-old-space-size=4096'],
      },
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
    hookTimeout: 30000,
    teardownTimeout: 20000,
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: wranglerConfigPath },
      remote: false,
      poolOptions: {
        workers: {
          isolatedStorage: true,
          singleWorker: true,
          unsafeEvalBinding: true,
          miniflare: {
            compatibilityDate: '2026-05-21',
            compatibilityFlags: ['nodejs_compat'],
            remote: false,
            bindings: {
              AI: undefined,
              STAGING_SEF_API_KEY: process.env.STAGING_SEF_API_KEY || "mock-local-key",
              SESSION_SECRET: process.env.SESSION_SECRET || "mock-secret"
            }
          },
        },
      },
    }),
  ],
});
