import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
    mockReset: true,
    // PGlite boots a full PostgreSQL WASM instance per test file, and each one
    // is memory hungry. Running every integration file at once exhausts the
    // heap, so the pool is deliberately small: correctness over speed.
    pool: 'threads',
    poolOptions: {
      threads: { minThreads: 1, maxThreads: 2 },
    },
    // PGlite boots a full PostgreSQL WASM instance per test file, which can take
    // a few seconds to collect on slower machines.
    testTimeout: 30000,
    hookTimeout: 60000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // The real 'server-only' entry throws outside React Server Components;
      // unit tests import server modules (e.g. password hashing), so map it
      // to an empty module in the test environment only.
      'server-only': path.resolve(__dirname, './tests/empty-module.ts'),
    },
  },
});
