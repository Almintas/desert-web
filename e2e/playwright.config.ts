import { defineConfig, devices } from '@playwright/test';

/**
 * Paleidžiama per `pnpm e2e` (scripts/run.mjs), kuris paleidžia serverius ir nustato E2E_* aplinką.
 * Testai dalijasi viena DB ir vienu atidarytu langu, todėl vykdomi nuosekliai.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: './test-results',
  use: {
    ...devices['Desktop Chrome'],
    locale: 'lt-LT',
    timezoneId: 'Europe/Vilnius',
    trace: 'off',
    screenshot: 'only-on-failure',
    headless: process.env.E2E_HEADED !== '1',
  },
  projects: [
    { name: 'main', testIgnore: /turnstile-fail\.spec\.ts/ },
    // API paleistas su Turnstile „visada atmeta“ secret (žr. scripts/run.mjs).
    { name: 'turnstile-fail', testMatch: /turnstile-fail\.spec\.ts/ },
  ],
});
