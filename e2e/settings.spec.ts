import { expect, test } from '@playwright/test';

test.describe('Settings Page & Navigation', () => {
  test('should render account hub and allow opening a section', async ({
    page,
  }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/accounts/);

    const title = page.locator('h1');
    await expect(title).toBeVisible();

    // Hub index shows filter or grouped nav
    const filter = page.getByPlaceholder(/Filter settings|Filtrar ajustes/i);
    await expect(filter.or(page.getByRole('navigation'))).toBeVisible();
  });

  test('should display biometric passkey section under security', async ({
    page,
  }) => {
    await page.goto('/accounts/security');

    const passkeyHeader = page
      .locator('text=/Biometría|Passkey|Passkeys/i')
      .first();
    await expect(passkeyHeader).toBeVisible({ timeout: 10000 });
  });
});
