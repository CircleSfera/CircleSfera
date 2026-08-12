import { expect, test } from '@playwright/test';

/**
 * Admin Panel is hosted on admin.circlesfera.com (local: admin.localhost).
 * On the apex SPA, /admin must redirect away (no in-app staff shell).
 * Destination tabs are root paths (/trust); unauthenticated users land on /login.
 */
test.describe('Admin Panel redirect from apex', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('apex /admin redirects to Admin Panel host', async ({ page }) => {
    await page.goto('/admin/trust');
    await page.waitForURL(/admin\.(localhost|circlesfera\.com)/, {
      timeout: 15_000,
    });
    const url = new URL(page.url());
    expect(url.hostname).toMatch(/^admin\.(localhost|circlesfera\.com)$/);
    // Root tabs — never admin.example.com/admin/...
    expect(url.pathname).not.toMatch(/^\/admin(\/|$)/);
    expect(url.hostname).not.toBe('localhost');
    expect(url.hostname).not.toBe('127.0.0.1');
  });
});
