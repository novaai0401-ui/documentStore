import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The smart/ engine modules are pure TS; Node is enough (spanBox falls
    // back to proportional sizing when no canvas/DOM is present).
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
