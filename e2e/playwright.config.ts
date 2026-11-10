import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the running Docker Compose stack (nginx, API, PostgreSQL, Mailpit).
 * Start it first with `docker compose --env-file .env.example up -d --build --wait` from the
 * repository root.
 *
 * Locally, PW_CHANNEL=msedge uses the Edge that ships with Windows, so no browser download is
 * needed. CI installs Playwright's own Chromium instead.
 */
export default defineConfig({
  testDir: './tests',
  // The tests share one stack and its rate limits, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    channel: process.env.PW_CHANNEL,
  },
});
