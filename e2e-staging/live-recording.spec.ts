import { expect, test } from '@playwright/test';
import { HOST, signIn } from './session.js';

// A broadcast on this environment is recorded and becomes its host's replay.
// The recorder writes its file in a folder the backend then reads: a folder
// the recorder cannot write in leaves every recording FAILED (QF-092).
test('a broadcast is recorded and its replay is ready for its host', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const host = await signIn(browser, HOST);
  // A broadcast left open by an earlier run is ended first.
  await host.post('/live/end');

  let streamId = '';
  host.page.on('response', async (response) => {
    if (response.url().endsWith('/api/v1/live/start') && response.ok()) {
      streamId = ((await response.json()) as { stream: { id: string } }).stream
        .id;
    }
  });

  await host.page.goto('/live/broadcast');
  await host.page.getByRole('button', { name: 'Go live' }).click();
  const end = host.page.getByRole('button', { name: 'End livestream' });
  await end.waitFor({ timeout: 30_000 });
  // Long enough for the recorder to join and write both tracks.
  await host.page.waitForTimeout(15_000);
  await end.click();
  await host.page
    .getByRole('dialog')
    .getByRole('button', { name: 'End livestream' })
    .click();
  await expect(
    host.page.getByRole('heading', { name: 'Your live has ended' }),
  ).toBeVisible({ timeout: 30_000 });
  expect(streamId).not.toBe('');

  try {
    await expect
      .poll(
        async () => {
          const recording = (await (
            await host.get(`/live-recordings/${streamId}`)
          ).json()) as { recordingStatus: string };
          return recording.recordingStatus;
        },
        { timeout: 240_000, intervals: [5_000] },
      )
      .toMatch(/^(READY|FAILED|SKIPPED_LIMIT|NONE)$/);

    const recording = (await (
      await host.get(`/live-recordings/${streamId}`)
    ).json()) as {
      recordingStatus: string;
      recordingDurationMs: number | null;
      replayUrl: string | null;
    };
    expect(recording.recordingStatus).toBe('READY');
    expect(recording.replayUrl).toBeTruthy();
    expect(recording.recordingDurationMs ?? 0).toBeGreaterThan(5_000);
  } finally {
    // Each run leaves no replay behind in the Test Account's archive.
    await host.delete(`/live-recordings/${streamId}`);
    await host.context.close();
  }
});
