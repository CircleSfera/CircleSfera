import { expect, test } from '@playwright/test';
import { enterAsNewUser } from './helpers/session.js';

test.describe('Settings', () => {
  test('account hub and security passkeys', async ({ page }) => {
    await enterAsNewUser(page, { scenario: 'settings' });
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/accounts/);
    await expect(page.getByPlaceholder('Filtrar ajustes…')).toBeVisible();

    await page.goto('/accounts/security');
    await expect(page.getByText('Passkey').first()).toBeVisible();
  });
});
