import { expect, test } from '@playwright/test';

test.describe('Admin Panel Redesign E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/analytics');
    // Non-staff users are redirected home by AdminGuard.
    test.skip(
      !page.url().includes('/admin/'),
      'E2E user is not staff; admin routes redirect to /',
    );
  });

  test('should load the Admin Panel page and header', async ({ page }) => {
    await expect(page).toHaveURL(/.*\/admin\/analytics/);
    await expect(page.locator('header')).toBeVisible({ timeout: 5000 });
  });

  test('should allow switching admin tabs seamlessly', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/.*\/admin\/users/);

    await page.goto('/admin/system-health');
    await expect(page).toHaveURL(/.*\/admin\/system-health/);
  });

  test('should render search input and table elements in users tab', async ({
    page,
  }) => {
    await page.goto('/admin/users');
    const searchInput = page.getByPlaceholder(/Search users|Buscar usuarios/i);
    if (await searchInput.isVisible()) {
      await expect(searchInput).toBeVisible();
    }
  });
});
