import { expect, type Page, test } from '@playwright/test';
import { undersizedControls } from './helpers/control-sizes';
import { prepareAuthenticatedSession } from './helpers/session';

/**
 * The settings hub, four of its sections and the saved page, on a phone and
 * on desktop: text is at least 12 px and controls are at size.
 */
async function prepare(page: Page) {
  await prepareAuthenticatedSession(page);
  const now = new Date().toISOString();
  await page.route('**/api/v1/auth/sessions**', (route) =>
    route.fulfill({
      status: 200,
      json: [
        {
          id: 'session-1',
          userAgent: 'Safari',
          createdAt: now,
          lastUsedAt: now,
          isCurrent: true,
        },
        {
          id: 'session-2',
          userAgent: 'Chrome',
          createdAt: now,
          lastUsedAt: now,
          isCurrent: false,
        },
      ],
    }),
  );
}

async function expectInOrder(page: Page) {
  // Entry animations.
  await page.waitForTimeout(600);
  // One main landmark: the page sits inside the one of the layout.
  await expect(page.locator('main')).toHaveCount(1);

  // Links inside a sentence are text, not controls of their own.
  const small = (await undersizedControls(page)).filter(
    (line) => !/^a \d+x(1\d|2\d|3\d) /.test(line),
  );
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
      if (box.width < 1 || box.height < 1) continue;
      const size = Number.parseFloat(getComputedStyle(parent).fontSize);
      if (size < 12) found.add(`${size}px "${content.slice(0, 20)}"`);
    }
    return [...found];
  });
  expect(text).toEqual([]);
}

for (const [label, viewport] of [
  ['on a phone', { width: 390, height: 844 }],
  ['on desktop', { width: 1440, height: 900 }],
] as const) {
  test.describe(label, () => {
    test.use({ viewport });

    for (const [name, url] of [
      ['the hub', '/accounts'],
      ['privacy', '/accounts/privacy'],
      ['notifications', '/accounts/notifications'],
      ['security', '/accounts/security'],
      ['account', '/accounts/account'],
      ['saved', '/saved'],
    ] as const) {
      test(name, async ({ page }) => {
        await prepare(page);
        await page.goto(url);
        await expectInOrder(page);
      });
    }
  });
}

test('a list the server answers wrongly does not take the security page down', async ({
  page,
}) => {
  await prepareAuthenticatedSession(page);
  // The catch-all answers these with an object instead of a list.
  await page.goto('/accounts/security');
  await expect(page.locator('main')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /Seguridad/ }).first(),
  ).toBeVisible();
});
