import { expect, test } from '@playwright/test';

// Use an isolated storage state (logged out) for auth tests
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication Flow', () => {
  test('should allow a user to navigate to login and see form', async ({
    page,
  }) => {
    await page.goto('/accounts/login');

    const emailInput = page.locator('#identifier');
    await expect(emailInput).toBeVisible();

    const passwordInput = page.locator('#password');
    await expect(passwordInput).toBeVisible();

    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/accounts/login');

    await page.locator('#identifier').fill('invalid_user@circlesfera.com');
    await page.locator('#password').fill('wrongpassword');
    await page.locator('button[type="submit"]').click();

    // Expect error message container
    const errorContainer = page.locator('.bg-red-500\\/10');
    await expect(errorContainer).toBeVisible({ timeout: 5000 });
  });

  test('should allow a new user to register', async ({ page }) => {
    const randomSuffix = Math.floor(Math.random() * 100000);
    const testEmail = `newuser${randomSuffix}@circlesfera.com`;

    await page.goto('/accounts/emailsignup');

    await page.locator('#fullName').fill('Test User');
    await page.locator('#username').fill(`testuser${randomSuffix}`);
    await page.locator('#email').fill(testEmail);
    await page.locator('#password').fill('password123');

    await page.locator('button[type="submit"]').click();

    // Should redirect to Home or Verification
    await expect(page).toHaveURL(/.*\/|.*\/auth\/verify-email/, {
      timeout: 10000,
    });
  });
});
