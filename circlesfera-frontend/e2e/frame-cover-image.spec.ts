import { expect, type Page, test } from '@playwright/test';
import es from '../src/locales/es.json' with { type: 'json' };
import {
  confirmFrameTrim,
  FIXTURES,
  goToCaption,
  openComposer,
  prepareComposerSession,
  uploadFixture,
  waitEditPreviewReady,
} from './helpers/composer';

/**
 * A Frame's cover taken from the gallery, as on Reels: chosen on the cover
 * screen, framed at 9:16 by dragging it, then shown as the cover chosen.
 * Sharing a Frame from the gallery is not taken here; what is sent with it
 * is checked by the publishing hook's tests.
 */
const cover = es.frames.cover;

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

for (const size of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test(`a Frame's cover is an image from the gallery (${size.width})`, async ({
    page,
  }, info) => {
    await page.setViewportSize(size);
    await prepareComposerSession(page);
    await uploadsNamedAfterTheirFile(page);
    await openComposer(page, 'frame');
    await uploadFixture(page, FIXTURES.frameVideo);
    await confirmFrameTrim(page);
    await waitEditPreviewReady(page, '9:16');
    await goToCaption(page);

    await page.getByRole('button', { name: cover.row }).click();
    await page
      .getByTestId('frame-cover-image-input')
      .setInputFiles(FIXTURES.postImage);
    const crop = page.getByTestId('frame-cover-image-crop');
    await expect(crop).toBeVisible();
    const picture = crop.getByRole('img', { name: cover.image_preview });
    const box = await picture.boundingBox();
    if (!box) throw new Error('No picture');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2, {
      steps: 5,
    });
    await page.mouse.up();
    await page.screenshot({ path: info.outputPath(`crop-${size.width}.png`) });
    await page.getByRole('button', { name: cover.image_use }).click();

    await expect(page.getByText(cover.image_chosen)).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`chosen-${size.width}.png`),
    });
    await page
      .getByRole('button', { name: es.createPost.header.back })
      .first()
      .click();
    await expect(
      page.getByRole('button', { name: cover.row_chosen }),
    ).toBeVisible();
  });
}
