import { expect, type Page, test } from '@playwright/test';
import { undersizedControls } from './helpers/control-sizes';
import { prepareGuestSession } from './helpers/session';

/**
 * The screens someone sees before signing in: sign-in, sign-up, password
 * recovery, email verification, the public landing and its pages. On a phone and on
 * desktop, text is at least 12 px and every control is at size.
 */
async function expectInOrder(page: Page) {
  // Entry animations.
  await page.waitForTimeout(900);
  expect(await undersizedControls(page)).toEqual([]);

  const text = await page.evaluate(() => {
    const found = new Set<string>();
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const content = walker.currentNode.textContent?.trim();
      const parent = walker.currentNode.parentElement;
      if (!content || !parent) continue;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) continue;
      const box = parent.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      const size = Number.parseFloat(getComputedStyle(parent).fontSize);
      if (size < 12) found.add(`${size}px "${content.slice(0, 20)}"`);
    }
    return [...found];
  });
  expect(text).toEqual([]);

  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
}

for (const [label, viewport] of [
  ['on a phone', { width: 390, height: 844 }],
  ['on desktop', { width: 1440, height: 900 }],
] as const) {
  test.describe(label, () => {
    test.use({ viewport });

    for (const [name, url] of [
      ['sign-in', '/accounts/login'],
      ['sign-up', '/accounts/signup'],
      ['forgot password', '/forgot-password'],
      ['reset password', '/reset-password?token=abc'],
      ['verify email', '/verify-email?token=abc'],
      ['landing', '/'],
      ['features', '/features'],
      ['feature detail', '/features/feed'],
      ['principles', '/principles'],
      ['help centre', '/help'],
      ['guest explore', '/explore'],
      ['support', '/support'],
      ['pricing', '/pricing'],
      ['terms', '/terms'],
      ['privacy', '/privacy'],
      ['guidelines', '/guidelines'],
    ] as const) {
      test(name, async ({ page }) => {
        await prepareGuestSession(page);
        await page.goto(url);
        await expectInOrder(page);
      });
    }
  });
}
