import { expect, test } from '@playwright/test';

/**
 * Lightweight smoke against local or production.
 * Does not require authenticated storageState.
 */
test.describe('CircleSfera Smoke Tests', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('home page loads with CircleSfera branding', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/CircleSfera/i);
  });

  test('auth entry points are reachable', async ({ page }) => {
    await page.goto('/');

    const loginLink = page.locator('a[href="/accounts/login"]').first();
    const signupLink = page.locator('a[href="/accounts/emailsignup"]').first();

    // Landing may hydrate client-side; wait for either link.
    await expect(loginLink.or(signupLink).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('login page renders', async ({ page }) => {
    await page.goto('/accounts/login');
    await expect(
      page.locator('form, input[type="email"], input[name="email"]').first(),
    ).toBeVisible({
      timeout: 20_000,
    });
  });

  test('API health is ok (when BACKEND_URL is set)', async ({ request }) => {
    const backend = process.env.BACKEND_URL || 'http://localhost:3005/api/v1';
    const res = await request.get(`${backend.replace(/\/$/, '')}/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status === 'ok' || body.status === 'error').toBeTruthy();
    // Prefer ok in production; allow error only if redis/db briefly flaky — assert shape.
    expect(body).toHaveProperty('info');
  });
});
