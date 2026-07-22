import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL || 'http://localhost:5173';
const isRemoteTarget = !/localhost|127\.0\.0\.1/.test(baseURL);
const skipGlobalSetup =
  process.env.SKIP_GLOBAL_SETUP === 'true' || isRemoteTarget;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  globalSetup: skipGlobalSetup ? undefined : './e2e/global-setup.ts',
  use: {
    baseURL,
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
  },
  // Only boot local Vite when targeting localhost.
  ...(isRemoteTarget
    ? {}
    : {
        webServer: {
          command: 'npm run dev -- --port 5173',
          cwd: './circlesfera-frontend',
          url: 'http://localhost:5173',
          reuseExistingServer: true,
          timeout: 30000,
        },
      }),
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Smoke uses empty storageState; other specs need global-setup artifact.
        ...(skipGlobalSetup ? {} : { storageState: 'storageState.json' }),
      },
    },
  ],
});
