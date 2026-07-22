import { expect, test } from '@playwright/test';

test.describe('Creator Subscriptions & Tier Access', () => {
  test('should render creator membership tier options', async ({ page }) => {
    await page.goto('/creator/tiers');
    await expect(page.locator('body')).toBeVisible();

    const heading = page.locator('h1, h2, h3').first();
    await expect(heading).toBeVisible();
  });

  test('should navigate to creator portal', async ({ page }) => {
    await page.goto('/creator/dashboard');
    await expect(page).toHaveURL(/.*\/creator\/dashboard/);
  });
});
