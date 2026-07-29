import { expect, test } from '@playwright/test';

test.describe('Authentication', () => {
  test('User can login and redirect to feed', async ({ page }) => {
    // Intercept backend login call
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        json: {
          data: {
            token: 'mock-token',
            user: {
              id: 'user-1',
              email: 'test@example.com',
              username: 'tester',
            },
          },
        },
      });
    });

    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        json: {
          data: {
            id: 'user-1',
            email: 'test@example.com',
            username: 'tester',
          },
        },
      });
    });

    await page.route('**/api/v1/feed*', async (route) => {
      await route.fulfill({
        json: { data: { items: [], nextCursor: null } },
      });
    });

    // Navigate to the login page
    await page.goto('/login');

    // Check that we are on the login page
    await expect(page).toHaveURL(/.*login/);

    // Fill in the form
    const email = process.env.E2E_USER_EMAIL || 'test@example.com';
    const password = process.env.E2E_USER_PASSWORD || 'Password123!';
    await page.fill('input[id="identifier"]', email);
    await page.fill('input[id="password"]', password);

    // Submit the form
    await page.click('button[type="submit"]');

    // Check if it redirects to the feed
    await expect(page).toHaveURL('/');

    // Check if the user is authenticated (e.g. navigation bar has profile link or "Feed" is visible)
    await expect(page.locator('nav')).toBeVisible();
  });
});
