import { expect, type Page, test } from '@playwright/test';
import { prepareComposerSession } from './helpers/composer';
import { prepareGuestSession } from './helpers/session';

/**
 * The fonts are served by CircleSfera itself: loading a page sends no request
 * to a font provider, and the fonts still load, the app's and the story
 * editor's.
 */
const FONT_HOSTS = /fonts\.googleapis\.com|fonts\.gstatic\.com/;

/** Loads each family and says whether one of its faces really loaded. */
async function loadedFamilies(page: Page, families: string[]) {
  return page.evaluate(async (names) => {
    await Promise.all(
      names.map((name) => document.fonts.load(`32px "${name}"`)),
    );
    const faces = [...document.fonts];
    return names.map((name) =>
      faces.some(
        (face) =>
          face.family.replace(/["']/g, '') === name && face.status === 'loaded',
      ),
    );
  }, families);
}

test('a page loads its fonts from CircleSfera and asks no font provider', async ({
  page,
}) => {
  const outside: string[] = [];
  page.on('request', (request) => {
    if (FONT_HOSTS.test(request.url())) outside.push(request.url());
  });

  await prepareGuestSession(page);
  await page.goto('/');
  await expect(page.locator('#root')).toBeAttached();
  expect(await loadedFamilies(page, ['Inter'])).toEqual([true]);

  expect(outside).toEqual([]);
});

test('the story editor fonts load from CircleSfera', async ({ page }) => {
  const outside: string[] = [];
  const local: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (FONT_HOSTS.test(url)) outside.push(url);
    else if (url.endsWith('.woff2')) local.push(url);
  });

  await prepareComposerSession(page);
  await page.goto('/create?mode=story');
  await expect(page.locator('#root')).toBeAttached();
  expect(
    await loadedFamilies(page, ['Bebas Neue', 'Pacifico', 'Caveat']),
  ).toEqual([true, true, true]);

  expect(outside).toEqual([]);
  expect(local.length).toBeGreaterThan(0);
  for (const url of local)
    expect(new URL(url).origin).toBe(new URL(page.url()).origin);
});
