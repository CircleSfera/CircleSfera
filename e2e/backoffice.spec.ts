import { expect, type Page, test } from '@playwright/test';
import { generateSync } from 'otplib';
import { createStaff, SEEDED_ADMIN } from './helpers/staff.js';

/**
 * Backoffice host suite: the staff site that runs the business, against the
 * real backend. Runs as the `backoffice` project (playwright.config.ts) on a
 * host whose name starts with `backoffice.` (default
 * http://backoffice.localhost:5173; override BACKOFFICE_BASE_URL). The
 * backend must allow that origin (CORS_ORIGIN) and the seed must have run
 * with ADMIN_E2E_FORCE_TOTP=1. See e2e/README.md.
 */

// Every section of the Backoffice, as adminNav.ts lists them.
const SECTIONS = [
  'overview',
  'support',
  'help-centre',
  'plans',
  'subscriptions',
  'disputes',
  'promotions',
  'monetization',
  'newsletter',
] as const;

// What a staff member with only the payments permission may open.
const PAYMENTS_SECTIONS = [
  'overview',
  'subscriptions',
  'disputes',
  'monetization',
];

type Staff = { email: string; password: string; totpSecret: string };

async function signIn(page: Page, staff: Staff) {
  await page.goto('/login');
  await page.locator('#admin-email').fill(staff.email);
  await page.locator('#admin-password').fill(staff.password);
  await page.getByRole('button', { name: /continue|continuar/i }).click();
  await expect(page.locator('#admin-mfa')).toBeVisible({ timeout: 15_000 });
  await page
    .locator('#admin-mfa')
    .fill(String(generateSync({ secret: staff.totpSecret })));
  await page.getByRole('button', { name: /verify|verificar/i }).click();
  // The Backoffice opens on its home, then on the first section it may open.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

/**
 * Asks the staff API from inside the page, as the Backoffice itself does:
 * with the session cookies of its own host. Node's resolver does not know
 * `backoffice.localhost`, so the test's own request context cannot reach it.
 */
async function statusFromPage(page: Page, path: string): Promise<number> {
  return page.evaluate(
    async (url) => (await fetch(url, { credentials: 'include' })).status,
    path,
  );
}

/**
 * Opens a section and checks it shows its real data or its empty state: the
 * page stays on it, nothing in the staff API it called failed, and no error
 * screen shows.
 */
async function openSection(page: Page, section: string) {
  const failed: string[] = [];
  const onResponse = (response: import('@playwright/test').Response) => {
    const url = response.url();
    if (url.includes('/api/v1/admin') && response.status() >= 400) {
      failed.push(`${response.status()} ${new URL(url).pathname}`);
    }
  };
  page.on('response', onResponse);
  try {
    await page.goto(`/${section}`);
    await expect(page).toHaveURL(new RegExp(`/${section}(?:\\?|$)`));
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main, [role="main"]').first()).toBeVisible();
    await expect(
      page.getByText(/something went wrong|algo salió mal/i),
    ).toHaveCount(0);
    expect(failed, `staff API calls that failed on ${section}`).toEqual([]);
  } finally {
    page.off('response', onResponse);
  }
}

test.describe('Backoffice', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('the super admin opens every section, each with its data or its empty state', async ({
    page,
  }) => {
    await signIn(page, SEEDED_ADMIN);
    await expect(page.getByText(/backoffice/i).first()).toBeVisible();
    for (const section of SECTIONS) {
      await openSection(page, section);
    }
  });

  test('a staff member with only payments sees and opens only their sections', async ({
    page,
    request,
  }) => {
    const staff = await createStaff(request, ['payments']);
    try {
      await signIn(page, staff);

      for (const section of PAYMENTS_SECTIONS) {
        await openSection(page, section);
      }

      // A section of another permission is not offered and does not open:
      // the page goes back to the home of what the person may open.
      for (const section of SECTIONS.filter(
        (s) => !PAYMENTS_SECTIONS.includes(s),
      )) {
        await page.goto(`/${section}`);
        await expect(page).not.toHaveURL(new RegExp(`/${section}(?:\\?|$)`));
      }
      await expect(page.getByRole('link', { name: 'Support' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Newsletter' })).toHaveCount(
        0,
      );

      // And the API refuses it, whatever the app shows.
      for (const path of [
        '/api/v1/admin/support/tickets',
        '/api/v1/admin/plans',
      ]) {
        expect(await statusFromPage(page, path), path).toBe(403);
      }
      expect(await statusFromPage(page, '/api/v1/admin/disputes')).toBe(200);
    } finally {
      await staff.remove();
    }
  });

  test('two sections fit a phone with no sideways scroll', async ({ page }) => {
    await signIn(page, SEEDED_ADMIN);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const section of ['disputes', 'monetization']) {
      await openSection(page, section);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth, `sideways scroll on ${section}`).toBeLessThanOrEqual(
        clientWidth + 1,
      );
    }
  });
});
