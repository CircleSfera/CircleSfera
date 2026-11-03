import { expect, type Page, test } from '@playwright/test';
import { prepareAuthenticatedSession } from './helpers/session';

/**
 * Every list shows content with the one thumbnail of the app: 56 px high,
 * in the shape of what it shows, with the same corners. Looked at in the
 * creator area and in the Admin Panel, on a phone and on a computer.
 */
const PHONE = { width: 390, height: 844 };
const COMPUTER = { width: 1280, height: 800 };
const THUMB_HEIGHT = 56;
const PICTURE =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="50"><rect width="40" height="50" fill="%237c3aed"/></svg>';

const posts = [
  { id: 'p1', caption: 'A photo', type: 'POST' },
  { id: 'p2', caption: 'A Frame', type: 'FRAME' },
].map((post) => ({
  ...post,
  views: 10,
  performanceScore: 1,
  createdAt: new Date().toISOString(),
  media: [{ url: PICTURE, type: 'image' }],
  _count: { likes: 1, comments: 0, bookmarks: 0 },
}));
const page1 = <T>(data: T[]) => ({
  data,
  meta: { total: data.length, page: 1, limit: 10, totalPages: 1 },
});

/** Every thumbnail of the list: one height and one corner radius. */
async function expectSharedThumbs(page: Page, count: number) {
  const thumbs = page.locator('img[src^="data:image/svg"]').locator('..');
  await expect(thumbs).toHaveCount(count, { timeout: 15_000 });
  const looks = await thumbs.evaluateAll((boxes) =>
    boxes.map((box) => {
      const style = getComputedStyle(box);
      return {
        height: Math.round(box.getBoundingClientRect().height),
        radius: style.borderTopLeftRadius,
      };
    }),
  );
  for (const look of looks) expect(look.height).toBe(THUMB_HEIGHT);
  expect(new Set(looks.map((look) => look.radius)).size).toBe(1);
}

for (const viewport of [PHONE, COMPUTER]) {
  test(`the creator's posts show the shared thumbnail (${viewport.width}px)`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await prepareAuthenticatedSession(page, { accountType: 'CREATOR' });
    await page.route('**/api/v1/creator/**', (route) =>
      route.fulfill({
        json: route.request().url().includes('creator/posts')
          ? page1(posts)
          : page1([]),
      }),
    );
    await page.goto('/creator/content');
    await expectSharedThumbs(page, 2);
    await page.screenshot({
      path: info.outputPath(`creator-${viewport.width}.png`),
    });
  });

  test(`the Admin Panel's posts show the shared thumbnail (${viewport.width}px)`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      localStorage.setItem('i18nextLng', 'es');
      localStorage.setItem(
        'cs_cookie_consent',
        JSON.stringify({ necessary: true, analytics: false }),
      );
    });
    const admin = {
      id: 'a1',
      email: 'staff@example.com',
      displayName: 'Staff',
      roles: ['SUPER_ADMIN'],
      permissions: [],
    };
    await page.route('**/api/v1/**', (route) => {
      const url = route.request().url();
      if (url.includes('admin-auth/me')) return route.fulfill({ json: admin });
      if (url.includes('csrf-token')) {
        return route.fulfill({ json: { csrfToken: 'e2e' } });
      }
      if (url.includes('admin/trust/queue')) {
        return route.fulfill({
          json: { counts: { reports: 0, appeals: 0, tickets: 0 }, items: [] },
        });
      }
      if (/admin\/posts(\?|$)/.test(url)) {
        return route.fulfill({
          json: page1(
            posts.map((post) => ({
              ...post,
              profile: { username: 'ana' },
              user: { profile: { username: 'ana' } },
            })),
          ),
        });
      }
      return route.fulfill({ json: page1([]) });
    });
    const base = new URL(info.project.use.baseURL ?? 'http://localhost:5199');
    await page.goto(`${base.protocol}//admin.localhost:${base.port}/posts`);
    await expectSharedThumbs(page, 2);
    await page.screenshot({
      path: info.outputPath(`admin-${viewport.width}.png`),
    });
  });
}
