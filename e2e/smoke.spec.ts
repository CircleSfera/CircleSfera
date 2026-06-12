import { expect, test } from '@playwright/test';

test.describe('CircleSfera Smoke Tests', () => {
  test('Landing Page loads correctly', async ({ page }) => {
    // Navigate to the landing page
    await page.goto('/');

    // Check title
    await expect(page).toHaveTitle(/CircleSfera - Social Reimagined/);

    // Check main heading
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toContainText(/Share Your/);
    await expect(heading).toContainText(/Universe/);

    // Check CTA button
    const getStartedBtn = page.getByRole('link', { name: /Get Started/i });
    await expect(getStartedBtn).toBeVisible();
  });

  test('Navigation links are present', async ({ page }) => {
    await page.goto('/');

    // Check for Log In and Sign Up links
    const loginLink = page.getByRole('link', { name: /Log In/i });
    const signupLink = page.getByRole('link', { name: /Sign Up/i });

    await expect(loginLink).toBeVisible();
    await expect(signupLink).toBeVisible();
  });

  test('Interactive tabs function correctly', async ({ page }) => {
    await page.goto('/');

    // Scroll to the interactive features section if needed
    // The "Create" tab should be clickable
    const createTab = page.getByRole('button', { name: /Create/i });
    await createTab.click();

    // After clicking "Create", the content should update
    const contentTitle = page.getByRole('heading', {
      name: /Artistic Expression/i,
    });
    await expect(contentTitle).toBeVisible();
  });
});
