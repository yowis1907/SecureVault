import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the running Docker Compose stack (nginx, API, PostgreSQL, Mailpit).
 * Start it first with `docker compose --env-file .env.example up -d --build --wait` from the
 * repository root.
 *
 * Locally, PW_CHANNEL=msedge uses the Edge that ships with Windows, so no browser download is
 * needed. CI installs Playwright's own Chromium instead.
 *
 * PW_BROWSER=firefox runs the same tests in Firefox. Each browser needs a fresh stack, because
 * the suite uses the whole hourly sign-up limit for one address.
 */
const firefox = process.env.PW_BROWSER === 'firefox';

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
    ...(firefox ? devices['Desktop Firefox'] : devices['Desktop Chrome']),
    channel: firefox ? undefined : process.env.PW_CHANNEL,
  },
});
