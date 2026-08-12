import { defineConfig, devices } from '@playwright/test';

const skipGlobalSetup = process.env.SKIP_GLOBAL_SETUP === 'true';

/** SPA origin — never the Nest API (:3000/:3005). */
function resolveApexBaseURL(): string {
  const candidates = [
    process.env.PLAYWRIGHT_BASE_URL,
    process.env.BASE_URL,
  ].filter(Boolean) as string[];
  for (const url of candidates) {
    try {
      const { port, hostname } = new URL(url);
      // Common API publish ports in this repo
      if (port === '3000' || port === '3005') continue;
      if (hostname === 'api.circlesfera.com') continue;
      return url;
    } catch {}
  }
  return 'http://localhost:5173';
}

const apexBaseURL = resolveApexBaseURL();
/** Admin Panel host — hostname must start with `admin.` (see adminPanel.ts). */
const adminBaseURL =
  process.env.ADMIN_BASE_URL || 'http://admin.localhost:5173';

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts$/,
  // Legacy mock specs under e2e/tests/ use stale routes (/login) and do not hit the real API.
  testIgnore: ['**/e2e/tests/**'],
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
    baseURL: apexBaseURL,
    storageState: skipGlobalSetup ? undefined : 'storageState.json',
    trace: 'on-first-retry',
    video: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      testIgnore: [/admin-panel\.spec\.ts$/],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'admin-panel',
      testMatch: /admin-panel\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: adminBaseURL,
        storageState: { cookies: [], origins: [] },
      },
    },
  ],

  /* Dev server: in CI the workflow starts Vite; locally Playwright boots it. */
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: 'npm --prefix circlesfera-frontend run dev',
        url: apexBaseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
      },
});
