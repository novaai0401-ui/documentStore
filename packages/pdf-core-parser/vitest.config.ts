import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the parser package.
 *
 * Tests import the built artifacts from ./dist, just like the original
 * .mjs smoke scripts did — keeps the test surface honest (we exercise
 * the compiled ESM bundle, not the source). Run `pnpm --filter
 * @pdfcraft/parser build` once before running tests.
 */
export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
    testTimeout: 10_000,
  },
});
