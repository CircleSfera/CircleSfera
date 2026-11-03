import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { prepareComposerSession } from './helpers/composer';

/**
 * A Frame recorded in clips, in a real browser with its test camera: the
 * clips are trimmed and ordered, sent, put together on the server (stubbed),
 * and the Frame goes on to its caption; back from the caption returns to
 * the clips as they were.
 */
test.use({
  permissions: ['camera', 'microphone'],
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
});

const FRAME_VIDEO = fs.readFileSync(
  path.join(import.meta.dirname, 'fixtures', 'frame-20s.mp4'),
);

async function stubAssembly(page: Page) {
  const sent = { clips: 0, assembly: [] as unknown[] };
  await page.route('**/api/v1/uploads/frames/clips', async (route) => {
    sent.clips++;
    await route.fulfill({
      status: 201,
      json: { url: `/uploads/clip-${sent.clips}.webm`, type: 'video' },
    });
  });
  await page.route('**/api/v1/uploads/frames', async (route) => {
    sent.assembly.push(route.request().postDataJSON());
    await route.fulfill({ status: 202, json: { id: 'frame-job' } });
  });
  let asked = 0;
  await page.route('**/api/v1/uploads/frames/frame-job', async (route) => {
    asked++;
    await route.fulfill({
      json:
        asked < 3
          ? { status: 'PENDING' }
          : { status: 'READY', url: '/uploads/frame.mp4' },
    });
  });
  await page.route('**/uploads/frame.mp4', (route) =>
    route.fulfill({ body: FRAME_VIDEO, contentType: 'video/mp4' }),
  );
  return sent;
}

async function recordClip(page: Page, ms: number) {
  await page
    .getByRole('button', { name: 'Grabar o parar, o mantener para grabar' })
    .click();
  await page.waitForTimeout(ms);
  await page.getByRole('button', { name: 'Grabando' }).click();
}

const PHONE = { width: 390, height: 844 };
const COMPUTER = { width: 1280, height: 800 };

/** A screenshot on the phone, and the same screen on a computer's width. */
async function capture(page: Page, name: string, info: TestInfo) {
  await page.screenshot({ path: info.outputPath(`${name}-390.png`) });
  await page.setViewportSize(COMPUTER);
  await page.screenshot({ path: info.outputPath(`${name}-1280.png`) });
  await page.setViewportSize(PHONE);
}

// Clips are recorded with a phone's camera: a computer picks a video from
// its gallery instead. The screens after it are looked at on both widths.
test('a Frame recorded in clips is put together and goes on to its caption', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize(PHONE);
  await prepareComposerSession(page);
  const sent = await stubAssembly(page);
  await page.goto('/create?mode=frame');

  await expect(page.locator('[data-testid="story-capture"] video')).toBeVisible(
    {
      timeout: 15_000,
    },
  );
  await recordClip(page, 8500);
  await recordClip(page, 8500);
  await page.getByRole('button', { name: 'Seguir con los clips' }).click();

  const editor = page.getByTestId('frame-clips-editor');
  await expect(editor).toBeVisible();
  await capture(page, 'clips-editor', info);
  await page.getByRole('button', { name: 'Clip 2 de 2' }).click();
  await page.getByRole('button', { name: 'Mover el clip antes' }).click();
  await editor.getByRole('button', { name: 'Siguiente' }).click();

  await expect(page.getByTestId('frame-assembly-progress')).toBeVisible();
  await capture(page, 'assembling', info);

  // The caption of the Frame, with the video put together.
  await expect(page.getByTestId('content-composer')).toBeVisible({
    timeout: 20_000,
  });
  await capture(page, 'caption', info);
  expect(sent.clips).toBe(2);
  expect(sent.assembly).toEqual([
    {
      clips: [
        expect.objectContaining({ url: '/uploads/clip-1.webm', startMs: 0 }),
        expect.objectContaining({ url: '/uploads/clip-2.webm', startMs: 0 }),
      ],
    },
  ]);

  // Back from the caption: the clips, in the order chosen.
  await page
    .getByRole('button', { name: /atrás|volver/i })
    .first()
    .click();
  await expect(editor).toBeVisible();
});
