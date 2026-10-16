import { expect, type Page, test } from '@playwright/test';
import { prepareComposerSession } from './helpers/composer';

/**
 * A story starts on the camera, in a real browser on a phone (390×844), with
 * the browser's own test camera and the network stubbed: a tap takes a
 * photo, holding records a video, and each opens the story editor.
 */
test.use({
  viewport: { width: 390, height: 844 },
  permissions: ['camera', 'microphone'],
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
});

async function recordPublishing(page: Page) {
  const sent = {
    uploads: [] as string[],
    stories: [] as Record<string, unknown>[],
  };
  await page.route('**/api/v1/uploads', async (route) => {
    const body = route.request().postDataBuffer()?.toString('latin1') ?? '';
    const type = /Content-Type: ([\w/+.-]+)/.exec(body)?.[1] ?? 'unknown';
    sent.uploads.push(type);
    await route.fulfill({
      status: 201,
      json: {
        url: `https://cdn.example.com/uploads/story.${type.startsWith('video') ? 'webm' : 'png'}`,
        type: type.startsWith('video') ? 'video' : 'image',
      },
    });
  });
  await page.route('**/api/v1/stories', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    sent.stories.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, json: { id: 'story-e2e' } });
  });
  return sent;
}

const shutter = (page: Page) =>
  page.getByRole('button', {
    name: 'Hacer una foto, o mantener para grabar un vídeo',
  });

test('a tap on the shutter takes a photo, which opens in the editor and is shared', async ({
  page,
}) => {
  await prepareComposerSession(page);
  const sent = await recordPublishing(page);
  await page.goto('/create?mode=story');

  await expect(shutter(page)).toBeVisible({ timeout: 15_000 });
  await expect(
    page.locator('[data-testid="story-capture"] video'),
  ).toBeVisible();
  await shutter(page).click();

  // The editor, with the photo as its background.
  await expect(
    page.getByRole('button', { name: 'Tu historia', exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('story-capture')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tu historia', exact: true }).click();

  await expect.poll(() => sent.stories.length, { timeout: 15_000 }).toBe(1);
  expect(sent.uploads).toEqual(['image/png']);
  expect(sent.stories[0]).toMatchObject({ mediaType: 'image' });
});

test('holding the shutter records a video, which stays a video', async ({
  page,
}) => {
  await prepareComposerSession(page);
  const sent = await recordPublishing(page);
  await page.goto('/create?mode=story');
  await expect(shutter(page)).toBeVisible({ timeout: 15_000 });

  const box = await shutter(page).boundingBox();
  if (!box) throw new Error('No shutter on screen');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.getByTestId('story-capture-progress')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.mouse.up();

  await expect(page.locator('video[data-export-ignore="true"]')).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Tu historia', exact: true }).click();

  await expect.poll(() => sent.stories.length, { timeout: 15_000 }).toBe(1);
  expect(sent.uploads[0]).toMatch(/^video\//);
  expect(sent.stories[0]).toMatchObject({ mediaType: 'video' });
});

test('Create starts a text story from the camera', async ({ page }) => {
  await prepareComposerSession(page);
  await page.goto('/create?mode=story');
  await expect(shutter(page)).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Crear Historia de Texto' }).click();

  await expect(
    page.getByRole('button', { name: 'Tu historia', exact: true }),
  ).toBeVisible();
});

test('without the camera allowed, offers the gallery and a text story instead', async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('Not allowed', 'NotAllowedError'));
  });
  await prepareComposerSession(page);
  await page.goto('/create?mode=story');

  await expect(
    page.getByText('La cámara no está permitida', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Elegir de la galería' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Crear Historia de Texto' }),
  ).toBeVisible();
  await expect(shutter(page)).toHaveCount(0);
});
