import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests share one Postgres test database (ase_test); run test
    // files sequentially so schema apply (drop + recreate) never races.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Default excludes plus the packaged build artifact (dist-pkg/), whose stale
    // duplicate tests must not run against source changes.
    exclude: ['**/node_modules/**', '**/dist/**', '**/dist-pkg/**', '**/.git/**'],
  },
});
