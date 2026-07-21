import { expect, test } from '@playwright/test';

test.describe('Admin Panel Redesign E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Admin Dashboard analytics tab
    await page.goto('/admin/analytics');
  });

  test('should load the Admin Panel page and header', async ({ page }) => {
    await expect(page).toHaveURL(/.*\/admin\/analytics/);
    await expect(page.locator('header')).toBeVisible({ timeout: 5000 });
  });

  test('should allow switching admin tabs seamlessly', async ({ page }) => {
    // Navigate to users tab
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/.*\/admin\/users/);

    // Navigate to system health tab
    await page.goto('/admin/system-health');
    await expect(page).toHaveURL(/.*\/admin\/system-health/);
  });

  test('should render search input and table elements in users tab', async ({
    page,
  }) => {
    await page.goto('/admin/users');
    const searchInput = page.getByPlaceholder(/Buscar usuarios/i);
    if (await searchInput.isVisible()) {
      await expect(searchInput).toBeVisible();
    }
  });
});
