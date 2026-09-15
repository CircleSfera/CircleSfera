import { expect, test } from '@playwright/test';
import { FIXTURES } from './helpers/composer';
import { prepareAuthenticatedSession, testPost } from './helpers/session';

const CDN = 'https://cdn.example.com/uploads/explore.jpg';

test.describe('Explorar', () => {
  test('muestra pins del grid y resultados de personas', async ({ page }) => {
    await prepareAuthenticatedSession(page);

    await page.route('https://cdn.example.com/**', async (route) => {
      await route.fulfill({
        path: FIXTURES.postImage,
        contentType: 'image/jpeg',
      });
    });

    const explorePost = testPost({
      id: 'post-1',
      caption: 'Publicación interesante en Explore',
      profileId: 'user2',
      media: [{ id: 'm-explore', url: CDN, type: 'image', order: 0 }],
      profile: {
        id: 'user2',
        userId: 'user2',
        username: 'explorer',
        fullName: 'Explorer User',
        bio: null,
        avatar: null,
        standardUrl: null,
        thumbnailUrl: null,
        website: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      _count: { likes: 15, comments: 3 },
    });

    await page.route('**/api/v1/feed/**', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          data: [explorePost],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        },
      });
    });

    await page.route('**/api/v1/search**', async (route) => {
      const url = route.request().url();
      if (url.includes('/search/history')) {
        await route.fulfill({ status: 200, json: [] });
        return;
      }
      if (!url.includes('q=alice')) {
        await route.fulfill({
          status: 200,
          json: { users: [], hashtags: [], semanticPosts: [] },
        });
        return;
      }
      await route.fulfill({
        status: 200,
        json: {
          users: [
            {
              id: 'user3',
              userId: 'user3',
              username: 'alice',
              fullName: 'Alice Smith',
              bio: null,
              avatar: null,
              standardUrl: null,
              thumbnailUrl: null,
              website: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          hashtags: [],
          semanticPosts: [
            {
              ...explorePost,
              id: 'post-2',
              caption: 'Resultado de búsqueda alice',
            },
          ],
        },
      });
    });

    await page.goto('/explore');
    await expect(page.locator('a[href="/p/post-1"]').first()).toBeVisible({
      timeout: 15_000,
    });

    const search = page.getByPlaceholder(
      'Busca usuarios, #etiquetas o contenido descrito...',
    );
    await expect(search).toBeVisible();
    await search.fill('alice');

    await expect(page.getByText('Alice Smith').first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('alice').first()).toBeVisible();
  });
});
