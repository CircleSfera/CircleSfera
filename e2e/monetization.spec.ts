import { expect, test } from '@playwright/test';
import { enterAsNewUser } from './helpers/session.js';

test.describe('Monetization', () => {
  test('creator sees Stripe Connect CTA (no Checkout)', async ({ page }) => {
    await enterAsNewUser(page, { creator: true });
    await page.goto('/creator/monetization');
    await expect(
      page.getByRole('button', { name: 'Conectar Stripe' }),
    ).toBeVisible();
  });
});
