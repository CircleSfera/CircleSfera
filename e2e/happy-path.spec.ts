import { expect, test } from '@playwright/test';
import {
  enterAsNewUser,
  openOwnLatestPost,
  publishPostWithCaption,
} from './helpers/session.js';

test.describe('Happy path', () => {
  test('register → onboard → publish → bio on profile', async ({ page }) => {
    test.setTimeout(120_000);
    const account = await enterAsNewUser(page);
    const caption = `Publicación E2E ${account.username}`;
    await publishPostWithCaption(page, caption);
    await openOwnLatestPost(page, account.username);
    await expect(
      page.getByText(caption).filter({ visible: true }).first(),
    ).toBeVisible();

    await page.goto('/accounts/profile');
    await expect(page.locator('#username')).toHaveValue(account.username);
    const bio = `Bio E2E ${account.username}`;
    await page.locator('#bio').fill(bio);
    const save = page.getByRole('button', {
      name: 'Guardar Cambios del Perfil',
    });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByText('Perfil actualizado con éxito')).toBeVisible();

    await page.goto(`/${account.username}`);
    await expect(page.getByText(bio)).toBeVisible();
  });
});
