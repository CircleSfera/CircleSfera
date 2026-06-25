import { chromium, type FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  const { baseURL } = config.projects[0].use;
  const browser = await chromium.launch();
  const page = await browser.newPage();

  console.log('Running Global Setup: Logging in test user...');

  try {
    // Navigate to login
    await page.goto(`${baseURL}/auth/login`);

    // Fill in credentials for the seeded user
    await page.locator('input[type="email"]').fill('easyfeliu@gmail.com');
    await page.locator('input[type="password"]').fill('password123');

    // Submit the form
    await page.locator('button[type="submit"]').click();

    // Wait for successful login (redirect to home or network idle)
    await page.waitForURL('**/', { timeout: 10000 });

    // Save the auth state
    await page.context().storageState({ path: 'storageState.json' });

    console.log('Global Setup complete: Auth state saved.');
  } catch (error) {
    console.error('Failed to login in global setup:', error);
    // You might want to generate the user via API here if they don't exist
  } finally {
    await browser.close();
  }
}

export default globalSetup;
