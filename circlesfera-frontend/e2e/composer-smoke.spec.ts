import { expect, test } from '@playwright/test';
import {
  composerShell,
  confirmFrameTrim,
  FIXTURES,
  goToCaption,
  headerPrimaryAction,
  openComposer,
  prepareComposerSession,
  uploadFixture,
  waitEditPreviewReady,
} from './helpers/composer';

test.use({
  viewport: { width: 390, height: 844 },
});

test.describe('Composer E2E smoke (390×844)', () => {
  test.beforeEach(async ({ page }) => {
    await prepareComposerSession(page);
  });

  test('Post: upload → edit → caption → share', async ({ page }) => {
    await openComposer(page, 'post');
    await uploadFixture(page, FIXTURES.postImage);
    await waitEditPreviewReady(page, '4:5');

    await goToCaption(page);
    await page.getByRole('textbox').first().fill('Playwright post smoke');
    await expect(page.getByText('Etiquetar Personas')).toBeVisible();

    await headerPrimaryAction(page).click();
    await expect(page).not.toHaveURL(/\/create/);
  });

  test('Frame: upload → trim → edit → caption', async ({ page }) => {
    await openComposer(page, 'frame');
    await uploadFixture(page, FIXTURES.frameVideo);
    await confirmFrameTrim(page);
    await waitEditPreviewReady(page, '9:16');

    await goToCaption(page);
    await page.getByRole('textbox').first().fill('Playwright frame smoke');

    await expect(page.getByText('Etiquetar Personas')).toHaveCount(0);
    await expect(page.getByText('Añadir Música')).toBeVisible();
    await expect(composerShell(page)).toBeVisible();
    // Share skipped: Frame export uses FFmpeg wasm (too heavy for smoke).
  });
});
