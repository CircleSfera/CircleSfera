import { expect, test } from '@playwright/test';
import { prepareGuest } from './helpers/session.js';

/**
 * Unauthenticated PR gate. Hits the live SPA + /health.
 * Does not register users.
 */
test.describe('CircleSfera Smoke Tests', () => {
  test('home page loads with CircleSfera branding', async ({ page }) => {
    await prepareGuest(page);
    await page.goto('/');
    await expect(page).toHaveTitle(/CircleSfera/i);
    await expect(page.locator('#root')).toBeAttached();
  });

  test('auth entry points are reachable', async ({ page }) => {
    await prepareGuest(page);
    await page.goto('/');
    const loginLink = page.locator('a[href="/accounts/login"]').first();
    const signupLink = page.locator('a[href="/accounts/signup"]').first();
    await expect(loginLink.or(signupLink).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('login page renders', async ({ page }) => {
    await prepareGuest(page);
    await page.goto('/accounts/login');
    await expect(page.locator('#identifier')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByTestId('login-submit-button')).toBeVisible();
  });

  test('API health is ok', async ({ request }) => {
    const backend = process.env.BACKEND_URL || 'http://localhost:3000/api/v1';
    const res = await request.get(`${backend.replace(/\/$/, '')}/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('info');
  });
});
