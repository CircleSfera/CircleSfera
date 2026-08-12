import { expect, type Page, test } from '@playwright/test';
import { generateSync } from 'otplib';

/**
 * Admin Panel host suite (separate from apex redirect in admin.spec.ts).
 *
 * Local default: http://admin.localhost:5173 (hostname starts with admin.).
 * Tabs live at root: /trust, /users — not /admin/*.
 * Override: ADMIN_BASE_URL. Seed MFA: ADMIN_E2E_TOTP_SECRET (see prisma/seed.ts).
 */
const ADMIN_EMAIL = process.env.ADMIN_E2E_EMAIL || 'admin@circlesfera.com';
const ADMIN_PASSWORD = process.env.ADMIN_E2E_PASSWORD || 'password123';
const ADMIN_TOTP =
  process.env.ADMIN_E2E_TOTP_SECRET || 'GK3L6YHMZSMTIZMLWAX3DJBYBOENFNJV';

async function loginAdminPanel(page: Page) {
  await page.goto('/login');
  await expect(page.getByText(/admin panel/i).first()).toBeVisible({
    timeout: 15_000,
  });

  await page.locator('#admin-email').fill(ADMIN_EMAIL);
  await page.locator('#admin-password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /continue|continuar/i }).click();

  await expect(page.locator('#admin-mfa')).toBeVisible({ timeout: 15_000 });

  let secret = ADMIN_TOTP;
  const secretMono = page.locator('.font-mono.text-brand-primary');
  if (await secretMono.isVisible().catch(() => false)) {
    const text = (await secretMono.textContent())?.trim();
    if (text) secret = text;
  }

  const otp = String(generateSync({ secret }));
  await page.locator('#admin-mfa').fill(otp);
  await page.getByRole('button', { name: /verify|verificar/i }).click();

  await expect(page).toHaveURL(/\/trust(?:\?|$)/, { timeout: 20_000 });
}

test.describe('Admin Panel login + smoke', () => {
  test.use({
    storageState: { cookies: [], origins: [] },
  });

  test('login with MFA and smoke trust / users / reports', async ({ page }) => {
    await loginAdminPanel(page);
    await expect(page.url()).not.toMatch(/\/admin\//);
    await expect(page.getByText(/admin panel/i).first()).toBeVisible();

    const cookies = await page.context().cookies();
    const names = cookies.map((c) => c.name);
    expect(names.some((n) => n.includes('admin_access'))).toBeTruthy();

    await page.goto('/users');
    await expect(page).toHaveURL(/\/users(?:\?|$)/);
    await expect(page.locator('body')).toContainText(/user|usuario/i, {
      timeout: 15_000,
    });

    await page.goto('/reports');
    await expect(page).toHaveURL(/\/reports(?:\?|$)/);
  });

  test('mobile trust: no horizontal overflow at 390 and 320', async ({
    page,
  }) => {
    await loginAdminPanel(page);

    for (const width of [390, 320] as const) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/trust');
      await expect(page.getByText(/admin panel/i).first()).toBeVisible({
        timeout: 15_000,
      });

      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        return {
          scrollWidth: root.scrollWidth,
          clientWidth: root.clientWidth,
        };
      });
      expect(
        overflow.scrollWidth,
        `horizontal overflow at ${width}px`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);

      await page.screenshot({
        path: `test-results/admin-trust-${width}.png`,
        fullPage: true,
      });
    }

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/trust');
    await expect(page.getByText(/admin panel/i).first()).toBeVisible();
    await page.screenshot({
      path: 'test-results/admin-trust-1280.png',
      fullPage: true,
    });
  });
});
