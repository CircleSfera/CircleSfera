import { expect, test } from '@playwright/test';
import { enterAsNewUser } from './helpers/session.js';

test.describe('Creator studio', () => {
  test('CREATOR can open analytics and monetization', async ({ page }) => {
    await enterAsNewUser(page, { scenario: 'creator', creator: true });
    await page.goto('/creator/analytics');
    await expect(page).toHaveURL(/\/creator\/analytics/);
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();

    await page.goto('/creator/monetization');
    await expect(
      page.getByRole('button', { name: 'Conectar Stripe' }),
    ).toBeVisible();
  });
});
