import { expect, type Page, test } from '@playwright/test';
import {
  prepareAuthenticatedSession,
  testPost,
  testProfile,
} from './helpers/session';

/**
 * The profile, one's own and someone else's, on a phone and on desktop: text
 * is at least 12 px, the controls of the page are at size, and nothing of the
 * header leaves its card.
 */
async function openProfile(
  page: Page,
  who: 'own' | 'other',
  accountType: 'PERSONAL' | 'CREATOR' = 'PERSONAL',
) {
  const { user } = await prepareAuthenticatedSession(page, { accountType });
  const username = who === 'own' ? user.username : 'ana';
  const profile = {
    ...testProfile({ bio: 'Fotógrafa de costa y montaña.', accountType }, user),
    ...(who === 'other'
      ? { id: 'profile-ana', userId: 'user-ana', username: 'ana' }
      : {}),
    website: 'https://ana.example.com',
    _count: { posts: 12, followers: 1280, following: 312 },
  };
  await page.route(`**/api/v1/profiles/${username}`, (route) =>
    route.fulfill({ status: 200, json: profile }),
  );
  await page.route('**/api/v1/posts/user/**', (route) =>
    route.fulfill({
      status: 200,
      json: {
        data: [testPost({ id: 'post-1', profileId: profile.id, username })],
        meta: { total: 1, page: 1, limit: 12, totalPages: 1 },
      },
    }),
  );
  await page.goto(`/${username}`);
  await expect(page.getByRole('button', { name: 'Seguidores' })).toBeVisible();
  // Entry animations and the counting figures.
  await page.waitForTimeout(1500);
}

async function expectInOrder(page: Page) {
  const report = await page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) return { text: ['no main'], controls: [], outside: [] };

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

    const name = (element: Element) =>
      (element.getAttribute('aria-label') || element.textContent || '')
        .trim()
        .slice(0, 24);
    const visible = (box: DOMRect) =>
      box.width > 1 && box.height > 1 && box.top < window.innerHeight;

    const controls = Array.from(main.querySelectorAll<HTMLElement>('button'))
      .map((element) => ({ element, box: element.getBoundingClientRect() }))
      .filter(({ box }) => visible(box))
      .filter(({ box }) => box.width < 43.5 || box.height < 43.5)
      .map(
        ({ element, box }) =>
          `${Math.round(box.width)}x${Math.round(box.height)} "${name(element)}"`,
      );

    const card = main.querySelector<HTMLElement>('.glass-panel');
    const cardBox = card?.getBoundingClientRect();
    const outside = cardBox
      ? Array.from(card?.querySelectorAll<HTMLElement>('button, a, span') ?? [])
          .map((element) => ({ element, box: element.getBoundingClientRect() }))
          .filter(({ box }) => visible(box))
          .filter(
            ({ box }) =>
              box.right > cardBox.right + 0.5 || box.left < cardBox.left - 0.5,
          )
          .map(({ element }) => name(element))
      : ['no header card'];

    return { text: [...text], controls, outside };
  });

  expect(report.text).toEqual([]);
  expect(report.controls).toEqual([]);
  expect(report.outside).toEqual([]);
}

for (const [label, viewport] of [
  ['on a phone', { width: 390, height: 844 }],
  ['on desktop', { width: 1440, height: 900 }],
] as const) {
  test.describe(label, () => {
    test.use({ viewport });

    test('my profile', async ({ page }) => {
      await openProfile(page, 'own');
      await expectInOrder(page);
    });

    test('the profile of someone else', async ({ page }) => {
      await openProfile(page, 'other');
      // The two main actions sit side by side without touching.
      const follow = await page
        .getByRole('button', { name: 'Seguir', exact: true })
        .filter({ visible: true })
        .boundingBox();
      const message = await page
        .getByRole('button', { name: 'Mensaje', exact: true })
        .filter({ visible: true })
        .boundingBox();
      expect(
        (message?.x ?? 0) - ((follow?.x ?? 0) + (follow?.width ?? 0)),
      ).toBeGreaterThanOrEqual(8);
      await expectInOrder(page);
    });
  });
}

test.describe('creator mode', () => {
  const creatorMode = (page: Page) =>
    page.getByRole('button', { name: 'Modo creador' });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('a creator account has the switch, and it swaps the bottom bar', async ({
      page,
    }) => {
      await openProfile(page, 'own', 'CREATOR');
      await expectInOrder(page);
      const bar = page.getByRole('navigation', { name: 'Navegación móvil' });

      await expect(creatorMode(page)).toHaveAttribute('aria-pressed', 'false');
      // The whole label is in view, not cut short.
      const cut = await creatorMode(page).evaluate((button) => {
        const label = button.querySelector('span');
        return label ? label.scrollWidth > label.clientWidth : true;
      });
      expect(cut).toBe(false);
      await expect(bar.getByRole('link', { name: 'Buscar' })).toBeVisible();

      await creatorMode(page).click();
      await expect(creatorMode(page)).toHaveAttribute('aria-pressed', 'true');
      await expect(bar.getByRole('link', { name: 'Buscar' })).toHaveCount(0);
      await expect(bar.getByRole('link', { name: 'Studio' })).toBeVisible();
    });

    test('a personal account has no switch', async ({ page }) => {
      await openProfile(page, 'own');
      await expect(creatorMode(page)).toHaveCount(0);
    });
  });

  test.describe('on desktop', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('there is no switch: it changes nothing there', async ({ page }) => {
      await openProfile(page, 'own', 'CREATOR');
      await expect(creatorMode(page)).toHaveCount(0);
    });
  });
});
