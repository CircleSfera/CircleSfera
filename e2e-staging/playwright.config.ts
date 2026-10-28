import { defineConfig, devices } from '@playwright/test';

/**
 * Checks that run against the running staging environment after each of its
 * deploys: what only a real server shows (stored files and their access,
 * media, the live service). They sign in with the environment's Test
 * Accounts, which see only other Test Accounts.
 *
 * Needs STAGING_SITE_PASSWORD (the site's password, user "circlesfera") and
 * STAGING_TEST_ACCOUNT_PASSWORD (the password of the Test Accounts made by
 * "Ops — test account in an environment").
 */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts$/,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // The accounts are shared, so the checks run one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  outputDir: './results',
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: './report' }]]
    : 'list',
  use: {
    baseURL: process.env.STAGING_URL ?? 'https://staging.circlesfera.com',
    httpCredentials: {
      username: 'circlesfera',
      password: process.env.STAGING_SITE_PASSWORD ?? '',
    },
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'staging',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
          ],
        },
      },
    },
  ],
});
