import { defineConfig, devices } from '@playwright/test';

/** SPA origin — never the Nest API (:3000/:3005). */
function resolveApexBaseURL(): string {
  const candidates = [
    process.env.PLAYWRIGHT_BASE_URL,
    process.env.BASE_URL,
  ].filter(Boolean) as string[];
  for (const url of candidates) {
    try {
      const { port, hostname } = new URL(url);
      if (port === '3000' || port === '3005') continue;
      if (hostname === 'api.circlesfera.com') continue;
      return url;
    } catch {
      /* ignore invalid */
    }
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
  globalTeardown: './e2e/helpers/teardown.ts',
  timeout: 90 * 1000,
  expect: {
    timeout: 10_000,
  },
  /* Each spec registers its own user. Do not share storageState.json. */
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    actionTimeout: 0,
    baseURL: apexBaseURL,
    storageState: { cookies: [], origins: [] },
    trace: 'on-first-retry',
    video: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'en-US',
    timezoneId: 'UTC',
  },
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
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: 'npm --prefix circlesfera-frontend run dev',
        url: apexBaseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
      },
});
