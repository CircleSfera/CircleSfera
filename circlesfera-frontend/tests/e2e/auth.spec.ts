import { expect, test } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should allow a user to navigate to login', async ({ page }) => {
    // Navigate to login
    await page.goto('/auth/login');

    // Expect the login form to be visible
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();

    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();

    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();
  });
});
