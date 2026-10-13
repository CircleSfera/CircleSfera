import { expect, test } from '@playwright/test';
import { enterAsNewUser } from './helpers/session.js';

test.describe('Live', () => {
  test('broadcast setup copy without starting LiveKit', async ({ page }) => {
    await enterAsNewUser(page, { scenario: 'live' });
    await page.goto('/live/broadcast');
    await expect(
      page.getByRole('heading', { name: 'Antes de emitir en directo' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Emitir en directo' }),
    ).toBeVisible();
  });

  test('a live that is not there says so on a screen of its own', async ({
    page,
  }) => {
    await enterAsNewUser(page, { scenario: 'live' });
    await page.goto('/live/stream-does-not-exist');
    await expect(
      page.getByRole('heading', { name: 'Este directo ha terminado' }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
