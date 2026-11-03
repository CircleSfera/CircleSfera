import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import es from '../src/locales/es.json' with { type: 'json' };
import {
  FIXTURES,
  goToCaption,
  headerPrimaryAction,
  openComposer,
  prepareComposerSession,
  waitEditPreviewReady,
} from './helpers/composer';

/**
 * A post with several photos as it is made today: picked together, put in
 * order, one taken out, and shared with its items in the order shown. It
 * guards the carousel while creation is redesigned.
 */
test.use({ viewport: { width: 390, height: 844 } });

const edit = es.createPost.edit;
const NAMES = ['first.jpg', 'second.jpg', 'third.jpg'];

function itemLabel(index: number, total: number) {
  return edit.media_item
    .replace('{{index}}', String(index))
    .replace('{{total}}', String(total));
}

/** Each upload answers with an address named after the file sent. */
async function uploadsNamedAfterTheirFile(page: Page) {
  await page.route('**/api/v1/uploads', async (route) => {
    const body = route.request().postDataBuffer()?.toString('latin1') ?? '';
    const name = /filename="([^"]+)"/.exec(body)?.[1] ?? 'unknown';
    await route.fulfill({
      status: 201,
      json: { url: `https://cdn.example.com/uploads/${name}`, type: 'image' },
    });
  });
}

/** The media addresses of the post the app creates, in the order sent. */
function sharedMedia(page: Page) {
  return new Promise<string[]>((resolve) => {
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/posts')) {
        const body = request.postDataJSON() as { media: { url: string }[] };
        resolve(body.media.map((m) => m.url.split('/').pop() ?? ''));
      }
    });
  });
}

test('a carousel is shared in the order it was put in, without the item taken out', async ({
  page,
}) => {
  await prepareComposerSession(page);
  await uploadsNamedAfterTheirFile(page);
  await openComposer(page, 'post');

  const photo = readFileSync(FIXTURES.postImage);
  await page
    .locator('input[type="file"]')
    .setInputFiles(
      NAMES.map((name) => ({ name, mimeType: 'image/jpeg', buffer: photo })),
    );
  await waitEditPreviewReady(page, '4:5');
  await expect(
    page.getByRole('button', { name: itemLabel(NAMES.length, NAMES.length) }),
  ).toBeVisible();

  // The last photo moves to the front, one place at a time.
  await page
    .getByRole('button', { name: itemLabel(NAMES.length, NAMES.length) })
    .click();
  for (let step = 1; step < NAMES.length; step++) {
    await page.getByRole('button', { name: edit.move_earlier }).click();
  }
  await expect(
    page.getByRole('button', { name: edit.move_earlier }),
  ).toBeDisabled();

  // The photo now last (the second one picked) is taken out.
  await page
    .getByRole('button', { name: itemLabel(NAMES.length, NAMES.length) })
    .click();
  await page.getByRole('button', { name: edit.remove_media }).click();
  await expect(
    page.getByRole('button', {
      name: itemLabel(NAMES.length - 1, NAMES.length - 1),
    }),
  ).toBeVisible();

  const media = sharedMedia(page);
  await goToCaption(page);
  await headerPrimaryAction(page).click();

  expect(await media).toEqual([NAMES[2], NAMES[0]]);
  await expect(page).not.toHaveURL(/\/create/);
});
