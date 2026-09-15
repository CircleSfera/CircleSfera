import { expect, test } from '@playwright/test';
import {
  enterAsNewUser,
  openOwnLatestPost,
  publishPostWithCaption,
} from './helpers/session.js';

test.describe('Social', () => {
  test('published post can be liked on its detail page', async ({ page }) => {
    const account = await enterAsNewUser(page);
    const caption = `Like E2E ${account.username}`;
    await publishPostWithCaption(page, caption);
    await openOwnLatestPost(page, account.username);
    await expect(
      page.getByText(caption).filter({ visible: true }).first(),
    ).toBeVisible();
    const like = page.getByTestId('like-button').filter({ visible: true });
    await expect(like).toBeVisible();
    await like.click();
    await expect(like).toHaveAttribute('data-liked', 'true');
  });
});
