import { expect, test } from '@playwright/test';
import { prepareGuestSession } from './helpers/session';

test.describe('Smoke', () => {
  test('la SPA carga y muestra la landing o el login', async ({ page }) => {
    await prepareGuestSession(page);
    await page.goto('/');
    await expect(page).toHaveTitle(/CircleSfera/);
    await expect(page.locator('#root')).toBeAttached();
  });
});
