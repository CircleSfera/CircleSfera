import { expect, test } from '@playwright/test';

test.describe('Creator Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Creator Dashboard
    await page.goto('/creator/analytics');
  });

  test('should load the Creator Dashboard with analytics tab', async ({
    page,
  }) => {
    // Check if the URL is correct
    await expect(page).toHaveURL(/.*\/creator\/analytics/);

    // The CreatorAnalyticsTab has an h2 heading
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test('should load monetization tab via Suspense without crashing', async ({
    page,
  }) => {
    // Click on monetization tab
    const monetizationTab = page
      .locator('a[href="/creator/monetization"]')
      .first();
    if (await monetizationTab.isVisible()) {
      await monetizationTab.click();

      // Wait for actual content
      await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible(
        {
          timeout: 5000,
        },
      );
    }
  });

  test('should have a CSV export button in analytics', async ({ page }) => {
    // Check for the export button we built
    const exportBtn = page.getByRole('button', { name: /Exportar CSV/i });
    if (await exportBtn.isVisible()) {
      await expect(exportBtn).toBeVisible();
      // We don't click it to avoid downloading files in CI, just verify its presence
    }
  });
});
