import { chromium, type FullConfig } from '@playwright/test';

/**
 * Seeds a test user and persists auth cookies to storageState.json.
 * Credentials must come from env (never hardcode secrets in the repo).
 *
 * Required:
 *   E2E_USER_EMAIL
 *   E2E_USER_PASSWORD
 * Optional:
 *   E2E_USER_USERNAME (defaults to local-part of email)
 *   E2E_USER_FULL_NAME (defaults to "Test User")
 *   BACKEND_URL (defaults to http://localhost:3005/api/v1)
 */
async function globalSetup(config: FullConfig) {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'E2E_USER_EMAIL and E2E_USER_PASSWORD must be set for Playwright global setup',
    );
  }

  const username =
    process.env.E2E_USER_USERNAME || email.split('@')[0] || 'e2euser';
  const fullName = process.env.E2E_USER_FULL_NAME || 'Test User';
  const backendURL = process.env.BACKEND_URL || 'http://localhost:3005/api/v1';

  const { baseURL } = config.projects[0].use;
  const browser = await chromium.launch();
  const page = await browser.newPage();

  console.log('Running Global Setup: Logging in test user...');

  try {
    // Seed the user via API to ensure it exists (ignore conflicts)
    await page.request.post(`${backendURL}/auth/register`, {
      data: {
        email,
        username,
        password,
        fullName,
      },
    });

    await page.goto(`${baseURL}/accounts/login`);
    await page.waitForSelector('#identifier', { timeout: 30000 });
    await page.locator('#identifier').fill(email);
    await page.locator('#password').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/', { timeout: 15000 });

    // Login navigates before/while profile hydrate — wait until Zustand persist has profile
    await page.waitForFunction(
      () => {
        try {
          const raw = localStorage.getItem('auth-storage');
          if (!raw) return false;
          const parsed = JSON.parse(raw) as {
            state?: { profile?: unknown; isAuthenticated?: boolean };
          };
          return Boolean(
            parsed.state?.isAuthenticated && parsed.state?.profile,
          );
        } catch {
          return false;
        }
      },
      null,
      { timeout: 15000 },
    );

    await page.context().storageState({ path: 'storageState.json' });
    console.log('Global Setup complete: Auth state saved.');
  } catch (error) {
    console.error('Failed to login in global setup:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
