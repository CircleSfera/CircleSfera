import { expect, type Page, test } from '@playwright/test';
import { FIXTURES, prepareComposerSession } from './helpers/composer';

/**
 * Text mode of the story editor, in a real browser on a phone (390×844).
 * The keyboard is stood in for by a shorter screen, as it is in the app,
 * whose web view gets shorter when the keyboard opens.
 */
test.use({ viewport: { width: 390, height: 844 } });

async function openPhotoStory(page: Page) {
  await prepareComposerSession(page);
  await page.goto('/create?mode=story');
  await page.locator('input[type="file"]').setInputFiles(FIXTURES.postImage);
  await expect(page.getByRole('button', { name: 'Texto' })).toBeVisible({
    timeout: 15_000,
  });
}

/** Where the text, the free band and the fonts are on the screen. */
function layout(page: Page) {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`${selector} is not on the screen`);
      return el.getBoundingClientRect();
    };
    const text = box('[data-testid="story-text-editor"]');
    const band = box('[data-story-text-band]');
    const fonts = box('[data-testid="story-text-bottom-row"] button');
    return {
      textMiddle: text.top + text.height / 2,
      bandMiddle: band.top + band.height / 2,
      fontsBottom: fonts.bottom,
      fontsHeight: fonts.height,
      screen: window.innerHeight,
    };
  });
}

test('a tap on the story starts a text over the keyboard, and a tap outside it ends it', async ({
  page,
}) => {
  await openPhotoStory(page);

  await page
    .getByTestId('story-canvas')
    .click({ position: { x: 200, y: 600 } });
  const text = page.getByRole('textbox', { name: 'Escribe algo…' });
  await expect(text).toBeFocused();
  await page.keyboard.type('Hola');

  // The fonts sit right above the keyboard and the text in the middle of what
  // is left, as the keyboard opens and as it closes.
  for (const height of [500, 844]) {
    await page.setViewportSize({ width: 390, height });
    await expect
      .poll(async () => {
        const at = await layout(page);
        return (
          Math.abs(at.screen - 8 - at.fontsBottom) <= 1 &&
          Math.abs(at.textMiddle - at.bandMiddle) <= 2
        );
      })
      .toBe(true);
    expect((await layout(page)).fontsHeight).toBeGreaterThanOrEqual(44);
  }

  // A font is chosen without leaving the text.
  await page.getByRole('button', { name: 'Playfair' }).click();
  await expect(text).toBeFocused();

  await page
    .getByTestId('story-canvas')
    .click({ position: { x: 200, y: 680 } });
  await expect(page.getByTestId('story-text-mode')).toHaveCount(0);
  await expect(page.getByTestId('story-element')).toHaveCount(1);
  await expect(page.getByTestId('story-element')).toContainText('Hola');
});
