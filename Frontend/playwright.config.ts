import { defineConfig, devices } from '@playwright/test';

/**
 * E2E.
 *
 * The unit and parity suites prove the algorithms and the four implementations
 * are correct. This proves the *app* works: that a deep link restores the exact
 * state, that stepping forward and back walks the whole trace, and that the
 * highlighted line in Python is the same step as the highlighted line in Java.
 *
 * The last one is the product claim, so it is asserted directly rather than
 * inferred.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:5178',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx vite preview --port 5178 --host 127.0.0.1',
    url: 'http://127.0.0.1:5178',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
