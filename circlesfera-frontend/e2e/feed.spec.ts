import { expect, test } from '@playwright/test';
import {
  FIXTURES,
  goToCaption,
  headerPrimaryAction,
  openComposer,
  prepareComposerSession,
  uploadFixture,
  waitEditPreviewReady,
} from './helpers/composer';
import { createScenarioUser, emptyPage, testPost } from './helpers/session';

const CAPTION = 'Publicación E2E del feed';
const CDN = 'https://cdn.example.com/uploads/test.jpg';

test.use({ viewport: { width: 390, height: 844 } });

test.describe('Feed (390×844)', () => {
  test('Post: upload → caption → share → aparece en Home', async ({ page }) => {
    const feedPosts: Record<string, unknown>[] = [];
    const user = createScenarioUser({ scenario: 'feed' });

    await prepareComposerSession(page, { scenario: 'feed' });

    await page.route('https://cdn.example.com/**', async (route) => {
      await route.fulfill({
        path: FIXTURES.postImage,
        contentType: 'image/jpeg',
      });
    });

    await page.route('**/api/v1/feed/**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          json: {
            data: feedPosts,
            meta: {
              total: feedPosts.length,
              page: 1,
              limit: 10,
              totalPages: 1,
            },
          },
        });
        return;
      }
      await route.fulfill({ status: 200, json: emptyPage });
    });

    await page.route('**/api/v1/posts', async (route) => {
      if (route.request().method() === 'POST') {
        let caption = CAPTION;
        try {
          const body = JSON.parse(route.request().postData() || '{}') as {
            caption?: string;
          };
          if (body.caption) caption = body.caption;
        } catch {
          /* keep default */
        }
        const created = testPost({
          id: 'post-feed-e2e',
          caption,
          profileId: user.id,
          media: [{ id: 'media-feed', url: CDN, type: 'image', order: 0 }],
        });
        feedPosts.unshift(created);
        await route.fulfill({ status: 201, json: created });
        return;
      }
      await route.fulfill({ status: 200, json: emptyPage });
    });

    await openComposer(page, 'post');
    await uploadFixture(page, FIXTURES.postImage);
    await waitEditPreviewReady(page, '4:5');
    await goToCaption(page);
    await page.getByRole('textbox').first().fill(CAPTION);
    await headerPrimaryAction(page).click();
    await expect(page).not.toHaveURL(/\/create/);

    await page.goto('/');
    await expect(page.getByText(CAPTION).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
