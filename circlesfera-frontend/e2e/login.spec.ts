import { expect, test } from '@playwright/test';
import { emptyPage, prepareGuestSession, testProfile } from './helpers/session';

test.describe('Login', () => {
  test('guest envía el formulario y llega a Home', async ({ page }) => {
    await prepareGuestSession(page);

    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        json: { accessToken: 'cookie-session', refreshToken: 'refresh' },
      });
    });

    const me = testProfile();
    await page.route('**/api/v1/profiles/me', async (route) => {
      await route.fulfill({ status: 200, json: me });
    });

    await page.route('**/api/v1/feed/**', async (route) => {
      await route.fulfill({ status: 200, json: emptyPage });
    });

    await page.goto('/accounts/login');
    await expect(page).toHaveTitle(/CircleSfera/);

    await page.locator('#identifier').fill('test@example.com');
    await page.locator('#password').fill('password123');
    await page.getByTestId('login-submit-button').click();

    await page.waitForURL((url) => !url.pathname.includes('/accounts/login'), {
      timeout: 15_000,
    });
    await expect(page.locator('nav').first()).toBeVisible();
  });
});
