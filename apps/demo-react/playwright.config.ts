import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end UI tests. Kept OUT of the default `pnpm test` (vitest) and out of
 * CI's `pnpm -r test` so it never blocks on browser binaries. To run:
 *
 *   pnpm --filter demo-react exec playwright install chromium
 *   pnpm --filter demo-react test:e2e
 *
 * Playwright boots the Vite dev server itself (webServer below).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm dev --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
