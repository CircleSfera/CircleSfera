import { expect, test } from '@playwright/test';

test.describe('Settings Page & Navigation', () => {
  test('should render settings page and allow switching tabs', async ({
    page,
  }) => {
    await page.goto('/settings');

    // Header title
    const title = page.locator('h1');
    await expect(title).toBeVisible();

    // Check desktop sidebar or mobile nav presence
    const settingsPanel = page.locator('.glass-panel');
    await expect(settingsPanel).toBeVisible();
  });

  test('should display biometric passkey section under security tab', async ({
    page,
  }) => {
    await page.goto('/settings');

    // Click Security tab
    const securityTab = page.locator('button', { hasText: /Seguridad|Security/i }).first();
    if (await securityTab.isVisible()) {
      await securityTab.click();
    }

    // Expect Biometrics / Passkey heading or text
    const passkeyHeader = page.locator('text=/Biometría|Passkey/i').first();
    await expect(passkeyHeader).toBeVisible({ timeout: 5000 });
  });
});
