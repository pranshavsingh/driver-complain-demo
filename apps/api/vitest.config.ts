import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    // These are integration tests against ONE shared Postgres database. Several of them
    // assert on what an admin sees with no filter ("total is 2"), which is only meaningful
    // if no other test file is inserting complaints at the same time. Running files in
    // parallel made those counts depend on scheduling order — deterministic locally, then
    // flaky the moment a new test file changed the interleaving. Sequential files trade a
    // few seconds of wall-clock for a suite that means what it says.
    fileParallelism: false,
  },
});
