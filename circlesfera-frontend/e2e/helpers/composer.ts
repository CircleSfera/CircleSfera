import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { prepareAuthenticatedSession } from './session';

/** Product fixtures for composer E2E (visible content, not solid color). */
export const FIXTURES = {
  postImage: path.join('e2e', 'fixtures', 'post-4x5.jpg'),
  frameVideo: path.join('e2e', 'fixtures', 'frame-20s.mp4'),
} as const;

export type ComposerMode = 'post' | 'frame';

/**
 * Auth + cookie consent + es locale + API stubs so /create works without a backend.
 * Stubs network only — UI under test is the real React composer.
 */
export async function prepareComposerSession(
  page: Page,
  options: { scenario?: string } = {},
): Promise<void> {
  await prepareAuthenticatedSession(page, options);

  await page.route('**/api/v1/uploads', async (route) => {
    await route.fulfill({
      status: 201,
      json: {
        url: 'https://cdn.example.com/uploads/test.jpg',
        type: 'image',
      },
    });
  });

  await page.route('**/api/v1/posts', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        json: {
          id: 'post-e2e',
          type: 'POST',
          caption: 'e2e',
          media: [],
          createdAt: new Date().toISOString(),
        },
      });
      return;
    }
    await route.fulfill({ status: 200, json: { data: [], meta: {} } });
  });
}

export function composerShell(page: Page) {
  return page.getByTestId('content-composer');
}

export function editPreviewFrame(page: Page) {
  return page.getByTestId('edit-preview-frame');
}

/** Header primary CTA — locale fixed to es in prepareComposerSession. */
export function headerPrimaryAction(page: Page) {
  return page
    .locator('header')
    .getByRole('button', { name: /^(Siguiente|Compartir)$/ })
    .first();
}

export async function openComposer(
  page: Page,
  mode: ComposerMode,
): Promise<void> {
  await page.goto(`/create?mode=${mode}`);
  const expected = mode === 'frame' ? 'FRAME' : 'POST';
  await expect(composerShell(page)).toHaveAttribute(
    'data-create-mode',
    expected,
  );
}

export async function uploadFixture(
  page: Page,
  fixturePath: string,
): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
}

export async function confirmFrameTrim(page: Page): Promise<void> {
  const done = page.getByRole('button', { name: /^Listo$/ }).first();
  await done.waitFor({ state: 'visible', timeout: 20_000 });
  await done.click();
  await expect(composerShell(page)).toBeVisible({ timeout: 15_000 });
}

export async function waitEditPreviewReady(
  page: Page,
  aspect: '4:5' | '9:16',
): Promise<void> {
  const frame = editPreviewFrame(page);
  await expect(frame).toHaveAttribute('data-aspect', aspect, {
    timeout: 15_000,
  });
  await expect(
    frame.getByRole('button', { name: /Editar Medio/i }),
  ).toBeVisible();

  await page.waitForFunction(
    () => {
      const root = document.querySelector('[data-testid="edit-preview-frame"]');
      if (!root) return false;
      const video = root.querySelector('video');
      if (video) {
        return video.readyState >= 2 && video.videoWidth > 0;
      }
      const img = root.querySelector('img');
      if (img) {
        return img.complete && img.naturalWidth > 0;
      }
      // Carousel / other media still counts once edit control is present
      return true;
    },
    { timeout: 15_000 },
  );
}

export async function goToCaption(page: Page): Promise<void> {
  await headerPrimaryAction(page).click();
  await expect(page.getByRole('textbox').first()).toBeVisible({
    timeout: 10_000,
  });
}
