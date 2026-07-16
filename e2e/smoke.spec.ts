import { expect, test } from '@playwright/test';

test.describe('CircleSfera Smoke Tests', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test('Landing Page loads correctly', async ({ page }) => {
    // Navigate to the landing page
    await page.goto('/');

    // Check title
    await expect(page).toHaveTitle(/CircleSfera/);

    // Check main heading
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();

    // Check CTA button by href
    const getStartedBtn = page
      .locator('a[href="/accounts/emailsignup"]')
      .first();
    await expect(getStartedBtn).toBeVisible();
  });

  test('Navigation links are present', async ({ page }) => {
    await page.goto('/');

    // Check for Log In and Sign Up links by href
    const loginLink = page.locator('a[href="/accounts/login"]').first();
    const signupLink = page.locator('a[href="/accounts/emailsignup"]').first();

    await expect(loginLink).toBeVisible();
    await expect(signupLink).toBeVisible();
  });

  test('Interactive tabs function correctly', async ({ page }) => {
    await page.goto('/');

    // Scroll to the interactive features section if needed
    // The tabs are buttons in the interactive section
    const createTab = page.locator('button').nth(1); // Second tab (Create)
    await createTab.click();

    // After clicking, a heading with level 2 should be visible inside the content area
    // The interactive features section has an h2 for the tab title
    // Just verify the component doesn't crash and we can click a tab
    const contentTitle = page.locator('.lg\\:w-2\\/3 h2').first();
    await expect(contentTitle).toBeVisible();
  });
});
