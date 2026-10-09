import { expect, type Page, test } from '@playwright/test';
import { prepareComposerSession } from './helpers/composer';
import { testPost, testProfile } from './helpers/session';

/**
 * The post detail with a caption and comments: text is at least 12 px, the
 * caption keeps its words whole, and the controls of the post and of each
 * comment are at size.
 */
const CAPTION =
  'Atardecer en la costa, una tarde larga para recordar, de las que no se olvidan nunca.';

async function openPost(page: Page) {
  await prepareComposerSession(page);
  await page.route('**/api/v1/posts/post-1', (route) =>
    route.fulfill({
      status: 200,
      json: testPost({
        caption: CAPTION,
        location: 'Cádiz, España',
        likesCount: 128,
        _count: { likes: 128, comments: 1 },
      }),
    }),
  );
  await page.route(/api\/v1\/.*comments/, (route) =>
    route.fulfill({
      status: 200,
      json: {
        data: [
          {
            id: 'comment-1',
            content: 'Qué bonito, me encanta la luz de esa hora',
            createdAt: new Date().toISOString(),
            postId: 'post-1',
            profileId: 'profile-ana',
            profile: { ...testProfile(), id: 'profile-ana', username: 'ana' },
            likesCount: 1,
            _count: { likes: 1, replies: 0 },
            replies: [],
          },
        ],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      },
    }),
  );
  await page.goto('/p/post-1');
  await expect(page.getByText('Qué bonito').first()).toBeVisible();
}

async function expectInOrder(page: Page) {
  const small = await page.evaluate(() => {
    const found = new Set<string>();
    const main = document.querySelector('main');
    if (!main) return ['no main'];
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent?.trim();
      const parent = walker.currentNode.parentElement;
      if (!text || !parent) continue;
      const box = parent.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      const size = Number.parseFloat(getComputedStyle(parent).fontSize);
      if (size < 12) found.add(`${size}px "${text.slice(0, 20)}"`);
    }
    return [...found];
  });
  expect(small).toEqual([]);

  for (const name of ['Volver', 'Me gusta', 'Responder', 'Más opciones']) {
    const box = await page
      .getByRole('button', { name, exact: false })
      .first()
      .boundingBox();
    expect(box, name).not.toBeNull();
    expect(box?.height, name).toBeGreaterThanOrEqual(44);
    expect(box?.width, name).toBeGreaterThanOrEqual(44);
  }

  const field = await page.getByPlaceholder(/coment/i).boundingBox();
  expect(field?.height).toBeGreaterThanOrEqual(48);
  // Room to read what is being written.
  expect(field?.width).toBeGreaterThanOrEqual(140);
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('text and controls are at size', async ({ page }) => {
    await openPost(page);
    await expectInOrder(page);
  });
});

test.describe('on desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('text and controls are at size, and the caption keeps its words whole', async ({
    page,
  }) => {
    await openPost(page);
    await expectInOrder(page);

    // No line of the caption ends in the middle of a word.
    const brokenWord = await page.evaluate((caption) => {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
      );
      let node: Node | null = null;
      while (walker.nextNode()) {
        const candidate = walker.currentNode;
        if (
          candidate.textContent === caption &&
          candidate.parentElement?.offsetParent
        ) {
          node = candidate;
          break;
        }
      }
      if (!node) return 'caption not found';
      const range = document.createRange();
      let lastTop: number | null = null;
      for (let index = 0; index < caption.length; index++) {
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const top = Math.round(range.getBoundingClientRect().top);
        if (
          lastTop !== null &&
          top > lastTop + 4 &&
          /\S/.test(caption[index]) &&
          /\S/.test(caption[index - 1])
        ) {
          return `"${caption.slice(index - 4, index)}|${caption.slice(index, index + 4)}"`;
        }
        lastTop = top;
      }
      return null;
    }, CAPTION);
    expect(brokenWord).toBeNull();
  });
});
