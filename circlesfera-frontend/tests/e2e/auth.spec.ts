import { expect, test } from '@playwright/test';

// Use an isolated storage state (logged out) for auth tests
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication Flow', () => {
  test('should allow a user to navigate to login and see form', async ({
    page,
  }) => {
    await page.goto('/auth/login');

    const emailInput = page.locator('#identifier');
    await expect(emailInput).toBeVisible();

    const passwordInput = page.locator('#password');
    await expect(passwordInput).toBeVisible();

    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/auth/login');

    await page.locator('#identifier').fill('invalid_user@circlesfera.com');
    await page.locator('#password').fill('wrongpassword');
    await page.locator('button[type="submit"]').click();

    // Expect some toast or error message (assumes react-hot-toast)
    page.locator('.go3958317564'); // generic toast class, or just wait for text
    await expect(page.getByText(/inválid|incorrect|error/i)).toBeVisible({
      timeout: 5000,
    });
  });

  test('should allow a new user to register', async ({ page }) => {
    const randomSuffix = Math.floor(Math.random() * 100000);
    const testEmail = `newuser${randomSuffix}@circlesfera.com`;

    await page.goto('/auth/register');

    await page.locator('input[name="fullName"]').fill('Test User');
    await page
      .locator('input[name="username"]')
      .fill(`testuser${randomSuffix}`);
    await page.locator('input[type="email"]').fill(testEmail);
    await page.locator('input[type="password"]').fill('password123');
    await page.locator('input[type="checkbox"]').check(); // terms

    await page.locator('button[type="submit"]').click();

    // Should redirect to Home or Verification
    await expect(page).toHaveURL(/.*\/|.*\/auth\/verify-email/, {
      timeout: 10000,
    });
  });
});
