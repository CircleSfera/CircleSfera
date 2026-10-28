import { expect, test } from '@playwright/test';
import { prepareGuest } from './helpers/session.js';
import { uniqueAccount } from './helpers/unique.js';

test.describe('Authentication Flow', () => {
  test('login form is visible', async ({ page }) => {
    await prepareGuest(page);
    await page.goto('/accounts/login');
    await expect(page.locator('#identifier')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByTestId('login-submit-button')).toBeVisible();
  });

  test('invalid credentials show an error', async ({ page }) => {
    await prepareGuest(page);
    await page.goto('/accounts/login');
    await page.locator('#identifier').fill('invalid_user@circlesfera.com');
    await page.locator('#password').fill('wrongpassword');
    await page.getByTestId('login-submit-button').click();
    await expect(page.locator('.bg-red-500\\/10')).toBeVisible();
  });

  test('new user can register and enters the app until the email is verified', async ({
    page,
  }) => {
    await prepareGuest(page);
    const account = uniqueAccount('reg');
    await page.goto('/accounts/signup');
    await page.locator('#fullName').fill(account.fullName);
    await page.locator('#username').fill(account.username);
    await page.locator('#email').fill(account.email);
    await page.locator('#password').fill(account.password);
    await page.locator('#dateOfBirth').fill(account.dateOfBirth);

    const registerResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/auth/register') &&
        res.request().method() === 'POST',
    );
    await page.locator('button[type="submit"]').click();
    const response = await registerResponse;
    expect(response.status(), await response.text()).toBe(201);
    // Every onboarding step saves, which waits for a verified email: the new
    // account enters the app under the notice that asks it to verify.
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await expect(
      page.getByRole('button', { name: /^(Resend|Reenviar)$/ }),
    ).toBeVisible();
  });
});
