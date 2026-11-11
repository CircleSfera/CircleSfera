import { expect, test } from '@playwright/test';
import { HOST, signIn } from './session.js';

// A Frame made on a phone, end to end on this environment's own server:
// recorded in two clips with the camera, trimmed, given a text, put
// together by the server, given a cover and shared; it is then on the
// author's profile and plays. The Frame is deleted at the end.
test('a Frame is recorded, edited, given a cover, shared, and plays on its profile', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const host = await signIn(browser, HOST, { phone: true });
  const page = host.page;
  let postId = '';
  page.on('response', async (response) => {
    if (
      response.request().method() === 'POST' &&
      /\/api\/v1\/posts$/.test(new URL(response.url()).pathname) &&
      response.ok()
    ) {
      postId = ((await response.json()) as { id: string }).id;
    }
  });

  try {
    await page.goto('/create?mode=frame');
    await expect(
      page.locator('[data-testid="story-capture"] video'),
    ).toBeVisible({ timeout: 30_000 });

    // Two clips of about nine seconds: a Frame lasts 15 s at least.
    const shutter = page.getByRole('button', {
      name: 'Start or stop recording, or hold to record',
    });
    for (let clip = 0; clip < 2; clip++) {
      await shutter.click();
      const recording = page.getByRole('button', { name: 'Recording' });
      await expect(recording).toBeVisible();
      await page.waitForTimeout(9_000);
      await recording.click();
      await expect(shutter).toBeVisible();
    }
    await page.getByRole('button', { name: 'Go on with the clips' }).click();

    const editor = page.getByTestId('frame-clips-editor');
    await expect(editor).toBeVisible();
    await expect(editor.getByText('Clip 1 of 2')).toBeVisible();

    // Trimmed: the first clip starts a little later.
    const start = page.getByRole('slider', { name: 'Start of the clip' });
    const before = Number(await start.getAttribute('aria-valuenow'));
    await start.focus();
    await start.press('ArrowRight');
    await start.press('ArrowRight');
    await expect
      .poll(async () => Number(await start.getAttribute('aria-valuenow')))
      .toBeGreaterThan(before);

    // A text over the video.
    await page.getByRole('button', { name: 'Text and drawing' }).click();
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await page.keyboard.type('Staging check');
    // The text, then the text-and-drawing editor, each closed with Done.
    const paintDone = page.getByRole('button', { name: 'Done', exact: true });
    const edited = page.getByRole('button', { name: 'Edit text and drawing' });
    await expect
      .poll(
        async () => {
          if (await edited.isVisible()) return true;
          if (await paintDone.first().isVisible()) {
            await paintDone.first().click();
          }
          return edited.isVisible();
        },
        { timeout: 30_000, intervals: [1_000] },
      )
      .toBe(true);

    // The server puts the clips together.
    await editor.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByTestId('content-composer')).toBeVisible({
      timeout: 180_000,
    });

    // A cover chosen at a moment of the video.
    await page.getByRole('button', { name: /Choose cover/ }).click();
    const moment = page.getByRole('slider', { name: 'Moment of the video' });
    const max = Number((await moment.getAttribute('max')) ?? 0);
    await moment.fill(String(Math.round(max / 2)));
    await expect(
      page.getByText(/^At 0:(0[1-9]|[1-5]\d) of the video$/),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByText('Cover chosen')).toBeVisible();

    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await expect.poll(() => postId, { timeout: 60_000 }).not.toBe('');

    // On the author's profile, and it plays.
    const frame = (await (await host.get(`/posts/${postId}`)).json()) as {
      type: string;
      media: Array<{ url: string; type: string }>;
    };
    expect(frame.type).toBe('FRAME');
    await page.goto(`/frames/${postId}`);
    const video = page.locator('video').first();
    await expect(video).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(
        () =>
          video.evaluate((v: HTMLVideoElement) => {
            v.muted = true;
            void v.play().catch(() => {});
            return v.currentTime;
          }),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0.5);
  } finally {
    if (postId) await host.delete(`/posts/${postId}`);
    await host.context.close();
  }
});
