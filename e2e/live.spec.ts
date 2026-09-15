import { expect, test } from '@playwright/test';
import { enterAsNewUser } from './helpers/session';

test.describe('Live', () => {
  test('broadcast setup copy without starting LiveKit', async ({ page }) => {
    await enterAsNewUser(page);
    await page.goto('/live/broadcast');
    await expect(
      page.getByRole('heading', { name: 'Empezar directo' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Empezar a emitir' }),
    ).toBeVisible();
  });

  test('unknown stream shows the product error', async ({ page }) => {
    await enterAsNewUser(page);
    await page.goto('/live/stream-does-not-exist');
    await expect(page).not.toHaveURL(/stream-does-not-exist/, {
      timeout: 15_000,
    });
  });
});
