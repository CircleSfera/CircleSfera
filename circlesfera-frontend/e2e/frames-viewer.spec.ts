import { expect, type Page, test } from '@playwright/test';
import { undersizedControls } from './helpers/control-sizes';
import {
  prepareAuthenticatedSession,
  testPost,
  testProfile,
} from './helpers/session';

/**
 * The frames viewer: the frame keeps its 9:16 shape on a phone, text is at
 * least 12 px and the controls over the video are at size.
 */
async function openFrames(page: Page) {
  await prepareAuthenticatedSession(page);
  const ana = { ...testProfile(), id: 'profile-ana', username: 'ana' };
  const frames = [0, 1].map((index) =>
    testPost({
      id: `frame-${index}`,
      type: 'FRAME',
      profileId: 'profile-ana',
      profile: ana,
      caption:
        'Atardecer en la costa con @bea, una tarde larga para recordar, de las que no se olvidan nunca jamás. #verano',
      location: 'Cádiz, España',
      likesCount: 1280,
      _count: { likes: 1280, comments: 42 },
      media: [
        {
          id: `media-${index}`,
          url: 'https://cdn.example.com/frame.mp4',
          type: 'video',
          order: 0,
        },
      ],
    }),
  );
  await page.route('**/api/v1/posts/frames**', (route) =>
    route.fulfill({
      status: 200,
      json: {
        data: frames,
        meta: { total: 2, page: 1, limit: 10, totalPages: 1 },
      },
    }),
  );
  await page.route('**/cdn.example.com/**', (route) => route.abort());
  await page.goto('/frames');
  await expect(
    page.getByRole('button', { name: 'Seguir' }).first(),
  ).toBeVisible();
}

async function expectInOrder(page: Page) {
  // Links inside the caption are text, not controls of their own.
  const small = await undersizedControls(page, {
    inlineLinks: '[data-frame-caption] a',
  });
  expect(small).toEqual([]);

  const text = await page.evaluate(() => {
    const found = new Set<string>();
    const main = document.querySelector('main');
    if (!main) return ['no main'];
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const content = walker.currentNode.textContent?.trim();
      const parent = walker.currentNode.parentElement;
      if (!content || !parent) continue;
      const box = parent.getBoundingClientRect();
      if (box.width < 1 || box.height < 1 || box.top > window.innerHeight) {
        continue;
      }
      const size = Number.parseFloat(getComputedStyle(parent).fontSize);
      if (size < 12) found.add(`${size}px "${content.slice(0, 20)}"`);
    }
    return [...found];
  });
  expect(text).toEqual([]);
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the frame is 9:16, not stretched to the height of the screen', async ({
    page,
  }) => {
    await openFrames(page);
    const frame = await page.locator('[data-index="0"]').boundingBox();
    expect(frame).not.toBeNull();
    const ratio = (frame?.width ?? 0) / (frame?.height ?? 1);
    expect(ratio).toBeGreaterThan(0.55);
    expect(ratio).toBeLessThan(0.58);
    await expectInOrder(page);
  });
});

test.describe('on a short phone', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('the frame is still 9:16 when the height left is what limits it', async ({
    page,
  }) => {
    await openFrames(page);
    const frame = await page.locator('[data-index="0"]').boundingBox();
    expect(frame).not.toBeNull();
    const ratio = (frame?.width ?? 0) / (frame?.height ?? 1);
    expect(ratio).toBeGreaterThan(0.55);
    expect(ratio).toBeLessThan(0.58);
    // It fits between the bars: nothing of it is cut off.
    expect(frame?.height ?? 0).toBeLessThanOrEqual(667 - 52 - 48);
    await expectInOrder(page);
  });
});

test.describe('on desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('text and controls are at size', async ({ page }) => {
    await openFrames(page);
    await expectInOrder(page);
  });
});
