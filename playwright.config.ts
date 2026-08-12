import { defineConfig, devices } from '@playwright/test';

const skipGlobalSetup = process.env.SKIP_GLOBAL_SETUP === 'true';

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts$/,
  /* Maximum time one test can run for. */
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  /* Authenticated suite seeds cookies via e2e/global-setup.ts */
  globalSetup: skipGlobalSetup ? undefined : './e2e/global-setup.ts',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. */
  use: {
    actionTimeout: 0,
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    storageState: skipGlobalSetup ? undefined : 'storageState.json',
    trace: 'on-first-retry',
    video: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Dev server: in CI the workflow starts Vite; locally Playwright boots it. */
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: 'npm --prefix circlesfera-frontend run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
      },
});
