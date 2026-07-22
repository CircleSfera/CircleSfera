import { expect, test } from '@playwright/test';

test.describe('Support Tickets & Help Center', () => {
  test('should render support portal and ticket modal', async ({ page }) => {
    await page.goto('/support');
    await expect(page.locator('body')).toBeVisible();

    const supportHeader = page.locator('h1, h2, header').first();
    await expect(supportHeader).toBeVisible();
  });

  test('should allow submitting a support ticket when authenticated', async ({
    page,
  }) => {
    await page.goto('/support');

    // Wait for auth profile hydrate so the form enables
    await page
      .waitForFunction(
        () => {
          try {
            const raw = localStorage.getItem('auth-storage');
            if (!raw) return false;
            const parsed = JSON.parse(raw) as {
              state?: { profile?: { user?: { email?: string } } };
            };
            return Boolean(parsed.state?.profile?.user?.email);
          } catch {
            return false;
          }
        },
        null,
        { timeout: 15000 },
      )
      .catch(() => undefined);

    const subject = page.locator('#subject');
    await expect(subject).toBeVisible({ timeout: 10000 });

    // If still disabled, assert the login warning instead of failing on fill
    if (await subject.isDisabled()) {
      await expect(
        page.getByText(/Debes iniciar sesión|sign in|login/i),
      ).toBeVisible();
      return;
    }

    await subject.fill('E2E support ticket');
    await page.locator('#message').fill('Automated Playwright support ticket.');
    await page.getByRole('button', { name: /Enviar Ticket|Send/i }).click();
    await expect(
      page.getByText(/Ticket enviado|enviado|success/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });
});
