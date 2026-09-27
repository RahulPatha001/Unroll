import { defineConfig, devices } from '@playwright/test';

/**
 * E2E and visual regression.
 *
 * The unit and parity suites prove the algorithms and the four implementations
 * are correct. This proves the *app* works: that a deep link restores the exact
 * state, that stepping forward and back walks the whole trace, and that the
 * highlighted line in Python is the same step as the highlighted line in Java.
 *
 * The last one is the product claim, so it is asserted directly rather than
 * inferred.
 *
 * Two suites, one server, because they need the same thing — a production build
 * served over HTTP, because a dev server's module graph and HMR client are not
 * what ships and would make every baseline a lie:
 *
 *  - `e2e` (`tests/e2e`) — behaviour. Fast, no flake, runs on every commit.
 *  - `visual` (`tests/visual`) — layout and pixels. Deliberately *one worker*:
 *    these tests are CPU-bound on Chromium rasterisation, and letting them
 *    compete with each other on a shared runner is the fastest way to turn a
 *    deterministic suite into a flaky one.
 *
 * The visual project is Chromium-only for the same reason the e2e one is: the
 * baselines are rasterised by one engine, and a baseline captured in Chromium
 * and compared in WebKit would differ on font metrics alone.
 */
export default defineConfig({
  testDir: 'tests',
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
  projects: [
    {
      name: 'e2e',
      testDir: 'tests/e2e',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'visual',
      testDir: 'tests/visual',
      fullyParallel: false,
      workers: 1,
      timeout: 60_000,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npx vite preview --port 5178 --host 127.0.0.1',
    url: 'http://127.0.0.1:5178',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
