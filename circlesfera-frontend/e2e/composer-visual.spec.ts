import { expect, test } from '@playwright/test';
import {
  composerShell,
  confirmFrameTrim,
  FIXTURES,
  goToCaption,
  openComposer,
  prepareComposerSession,
  uploadFixture,
  waitEditPreviewReady,
} from './helpers/composer';

/**
 * Visual regression against the real Post/Frame composer (ADR-0018).
 * Locale es + product fixtures with visible media content.
 */
test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});

const shotOpts = {
  animations: 'disabled' as const,
  maxDiffPixelRatio: 0.06,
};

test.describe('Composer visual regression (live app, 390×844)', () => {
  test.beforeEach(async ({ page }) => {
    await prepareComposerSession(page);
  });

  test('snapshot: frame-upload', async ({ page }) => {
    await openComposer(page, 'frame');
    await expect(
      page.getByRole('button', { name: 'Seleccionar video' }),
    ).toBeVisible();
    await expect(composerShell(page)).toHaveScreenshot(
      'frame-upload.png',
      shotOpts,
    );
  });

  test('snapshot: frame-edit', async ({ page }) => {
    await openComposer(page, 'frame');
    await uploadFixture(page, FIXTURES.frameVideo);
    await confirmFrameTrim(page);
    await waitEditPreviewReady(page, '9:16');
    await expect(composerShell(page)).toHaveScreenshot(
      'frame-edit.png',
      shotOpts,
    );
  });

  test('snapshot: frame-caption', async ({ page }) => {
    await openComposer(page, 'frame');
    await uploadFixture(page, FIXTURES.frameVideo);
    await confirmFrameTrim(page);
    await waitEditPreviewReady(page, '9:16');
    await goToCaption(page);
    await expect(page.getByText('Añadir Música')).toBeVisible();
    await expect(page.getByText('Etiquetar Personas')).toHaveCount(0);
    await expect(composerShell(page)).toHaveScreenshot(
      'frame-caption.png',
      shotOpts,
    );
  });

  test('snapshot: post-edit', async ({ page }) => {
    await openComposer(page, 'post');
    await uploadFixture(page, FIXTURES.postImage);
    await waitEditPreviewReady(page, '4:5');
    await expect(composerShell(page)).toHaveScreenshot(
      'post-edit.png',
      shotOpts,
    );
  });
});
