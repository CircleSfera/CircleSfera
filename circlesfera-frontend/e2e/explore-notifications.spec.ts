import { expect, type Page, test } from '@playwright/test';
import { undersizedControls } from './helpers/control-sizes';
import {
  prepareAuthenticatedSession,
  testPost,
  testProfile,
} from './helpers/session';

/**
 * Explore, its search results and the notifications, on a phone and on
 * desktop: text is at least 12 px, controls are at size and every control
 * says what it is.
 */
const page1 = <T>(data: T[]) => ({
  data,
  meta: { total: data.length, page: 1, limit: 20, totalPages: 1 },
});

async function prepare(page: Page) {
  await prepareAuthenticatedSession(page);
  const posts = [0, 1, 2].map((index) => testPost({ id: `post-${index}` }));
  const ana = { ...testProfile(), id: 'profile-ana', username: 'ana' };

  await page.route('**/api/v1/feed/foryou**', (route) =>
    route.fulfill({ status: 200, json: page1(posts) }),
  );
  await page.route('**/api/v1/search?**', (route) =>
    route.fulfill({
      status: 200,
      json: {
        users: [ana],
        posts,
        semanticPosts: posts,
        hashtags: [{ id: 'tag-1', tag: 'atardecer', postCount: 320 }],
      },
    }),
  );
  await page.route(/api\/v1\/notifications(\?|$)/, (route) =>
    route.fulfill({
      status: 200,
      json: page1(
        ['LIKE', 'COMMENT', 'FOLLOW'].map((type, index) => ({
          id: `notification-${index}`,
          type,
          read: index > 0,
          createdAt: new Date(Date.now() - index * 3_600_000).toISOString(),
          postId: type === 'FOLLOW' ? null : 'post-1',
          senderId: 'profile-ana',
          sender: { username: 'ana', avatar: null },
        })),
      ),
    }),
  );
}

async function expectInOrder(page: Page) {
  // A link inside a sentence is text, not a control of its own: it flows
  // inline in a paragraph that says more than the link. A link that stands
  // alone is measured like any other control.
  const inSentence = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
      .filter((link) => {
        const paragraph = link.closest('p');
        const words = (link.textContent ?? '').trim();
        return (
          !!paragraph &&
          getComputedStyle(link).display === 'inline' &&
          (paragraph.textContent ?? '').trim().length > words.length
        );
      })
      .map((link) => (link.textContent ?? '').trim().slice(0, 30)),
  );
  const small = (await undersizedControls(page)).filter(
    (line) =>
      !inSentence.some(
        (name) => line.startsWith('a ') && line.endsWith(`"${name}"`),
      ),
  );
  expect(small).toEqual([]);

  const report = await page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) return { text: ['no main'], unnamed: [] };
    const text = new Set<string>();
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const content = walker.currentNode.textContent?.trim();
      const parent = walker.currentNode.parentElement;
      if (!content || !parent) continue;
      const box = parent.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      const size = Number.parseFloat(getComputedStyle(parent).fontSize);
      if (size < 12) text.add(`${size}px "${content.slice(0, 20)}"`);
    }
    const unnamed = Array.from(
      main.querySelectorAll<HTMLElement>('button, a[href]'),
    )
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 1 && box.height > 1;
      })
      .filter(
        (element) =>
          !(
            element.getAttribute('aria-label') ||
            element.textContent?.trim() ||
            element.querySelector('img[alt]:not([alt=""])')
          ),
      )
      .map((element) => element.outerHTML.slice(0, 80));
    return { text: [...text], unnamed };
  });
  expect(report.text).toEqual([]);
  expect(report.unnamed).toEqual([]);
}

for (const [label, viewport] of [
  ['on a phone', { width: 390, height: 844 }],
  ['on desktop', { width: 1440, height: 900 }],
] as const) {
  test.describe(label, () => {
    test.use({ viewport });

    test('explore, and its search results', async ({ page }) => {
      await prepare(page);
      await page.goto('/explore');
      const search = page.getByTestId('explore-search-input');
      await expect(search).toBeVisible();
      await expectInOrder(page);

      await search.fill('atardecer');
      await expect(
        page.getByRole('link', { name: /#atardecer/ }),
      ).toBeVisible();
      await expectInOrder(page);
    });

    test('notifications', async ({ page }) => {
      await prepare(page);
      await page.goto('/notifications');
      await expect(
        page.getByRole('link', { name: 'Ver la publicación' }).first(),
      ).toBeVisible();
      await expectInOrder(page);
    });
  });
}
