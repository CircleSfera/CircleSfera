import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Optional: automatically start servers
  // webServer: [
  //   {
  //     command: 'npm run dev',
  //     cwd: './circlesfera-frontend',
  //     port: 5173,
  //     reuseExistingServer: !process.env.CI,
  //   },
  //   {
  //     command: 'npm run dev',
  //     cwd: './circlesfera-backend',
  //     port: 3000,
  //     reuseExistingServer: !process.env.CI,
  //   }
  // ],
});
