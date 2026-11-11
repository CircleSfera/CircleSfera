import { expect, test } from '@playwright/test';
import { HOST, signIn, VIEWER } from './session.js';

// A live with a guest, end to end on this environment's own live service and
// recorder, on two phones: the host goes live, invites the other Test
// Account, which joins from the invitation on the live it watches; both are
// on air; the host ends it and its recording becomes a replay that plays.
// The replay is deleted at the end.
test('a live with a guest on air is recorded and its replay plays', async ({
  browser,
}) => {
  test.setTimeout(600_000);
  const host = await signIn(browser, HOST, { phone: true });
  const guest = await signIn(browser, VIEWER, { phone: true });
  // A broadcast left open by an earlier run is ended first.
  await host.post('/live/end');

  let streamId = '';
  host.page.on('response', async (response) => {
    if (response.url().endsWith('/api/v1/live/start') && response.ok()) {
      streamId = ((await response.json()) as { stream: { id: string } }).stream
        .id;
    }
  });

  try {
    await host.page.goto('/live/broadcast');
    await host.page.getByRole('button', { name: 'Go live' }).click();
    const end = host.page.getByRole('button', { name: 'End livestream' });
    await end.waitFor({ timeout: 60_000 });
    await expect.poll(() => streamId).not.toBe('');

    // The guest watches the live, and the host invites it.
    await guest.page.goto(`/live/${streamId}`);
    const guestProfile = (await (
      await host.get(`/profiles/${VIEWER}`)
    ).json()) as { id: string };
    const invited = await host.post(`/live/${streamId}/guests`, {
      profileId: guestProfile.id,
    });
    expect(invited.status(), await invited.text()).toBe(201);

    // It joins from the invitation, as a person does.
    await guest.page
      .getByRole('button', { name: 'Join as co-host' })
      .click({ timeout: 60_000 });
    await expect
      .poll(
        async () => {
          const live = (await (await host.get(`/live/${streamId}`)).json()) as {
            guests?: Array<{ profileId: string; status: string }>;
          };
          return live.guests?.find((g) => g.profileId === guestProfile.id)
            ?.status;
        },
        { timeout: 60_000, intervals: [2_000] },
      )
      .toBe('ON_AIR');

    // Both on air long enough for the recorder to write each of them.
    await host.page.waitForTimeout(30_000);
    await end.click();
    await host.page
      .getByRole('dialog')
      .getByRole('button', { name: 'End livestream' })
      .click();
    await expect(
      host.page.getByRole('heading', { name: 'Your live has ended' }),
    ).toBeVisible({ timeout: 30_000 });

    await expect
      .poll(
        async () =>
          (
            (await (await host.get(`/live-recordings/${streamId}`)).json()) as {
              recordingStatus: string;
            }
          ).recordingStatus,
        { timeout: 480_000, intervals: [10_000] },
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
    expect(recording.recordingDurationMs ?? 0).toBeGreaterThan(20_000);
    expect(recording.replayUrl).toBeTruthy();
    // The replay is served to its host.
    const replay = await host.page.request.get(recording.replayUrl as string);
    expect(replay.status()).toBe(200);
  } finally {
    if (streamId) await host.delete(`/live-recordings/${streamId}`);
    await host.post('/live/end');
    await host.context.close();
    await guest.context.close();
  }
});
