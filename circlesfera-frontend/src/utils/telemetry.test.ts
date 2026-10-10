import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../services/api';
import { getCookieConsent } from './cookieConsent';
import { type TelemetryEvent, telemetry } from './telemetry';

vi.mock('../services/api', () => ({ apiClient: { post: vi.fn() } }));
vi.mock('./cookieConsent', () => ({ getCookieConsent: vi.fn() }));

const event = (targetId: string): TelemetryEvent => ({
  eventType: 'IMPRESSION',
  targetId,
  targetType: 'POST',
});
const consent = (analytics: boolean | null) =>
  vi
    .mocked(getCookieConsent)
    .mockReturnValue(
      analytics === null
        ? null
        : { necessary: true, analytics, updatedAt: '2026-01-01' },
    );
const sent = () =>
  vi
    .mocked(apiClient.post)
    .mock.calls.map(([, body]) =>
      (body as { events: TelemetryEvent[] }).events.map((e) => e.targetId),
    );

describe('telemetry', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Empty whatever an earlier test left waiting.
    consent(false);
    await telemetry.flush();
    vi.clearAllMocks();
    vi.mocked(apiClient.post).mockResolvedValue({} as never);
    consent(true);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sends the events together, five seconds after the first one', async () => {
    telemetry.track(event('a'));
    telemetry.track(event('b'));

    await vi.advanceTimersByTimeAsync(4900);
    expect(apiClient.post).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);
    expect(apiClient.post).toHaveBeenCalledWith('/analytics/events/batch', {
      events: [event('a'), event('b')],
    });
  });

  it('sends at once when ten are waiting, without waiting for the timer', async () => {
    for (let i = 0; i < 10; i++) telemetry.track(event(`e${i}`));
    await vi.advanceTimersByTimeAsync(0);

    expect(sent()).toEqual([
      ['e0', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'e9'],
    ]);
    await vi.advanceTimersByTimeAsync(6000);
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['said no to analytics', false],
    ['has not answered yet', null],
  ])('records nothing for a person who %s', async (_case, analytics) => {
    consent(analytics);

    telemetry.track(event('a'));
    await vi.advanceTimersByTimeAsync(6000);

    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('throws away what was waiting when the person withdraws the consent', async () => {
    telemetry.track(event('a'));
    consent(false);

    await vi.advanceTimersByTimeAsync(6000);
    consent(true);
    await telemetry.flush();

    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('keeps the events of a failed send for the next one, in order', async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('down'));
    telemetry.track(event('a'));
    await telemetry.flush();

    telemetry.track(event('b'));
    await telemetry.flush();

    expect(sent()).toEqual([['a'], ['a', 'b']]);
  });

  it('does not keep them when the server refuses the write, so the API is not hammered', async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce({
      response: { status: 403 },
    });
    telemetry.track(event('a'));
    await telemetry.flush();
    await telemetry.flush();

    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });

  it('keeps at most a hundred events while the server cannot be reached', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('down'));
    for (let i = 0; i < 130; i++) {
      telemetry.track(event(`e${i}`));
      await vi.advanceTimersByTimeAsync(0);
    }
    vi.mocked(apiClient.post).mockClear();
    vi.mocked(apiClient.post).mockResolvedValue({} as never);

    await telemetry.flush();

    expect(sent()[0]).toHaveLength(100);
    expect(sent()[0][0]).toBe('e0');
  });

  it('sends nothing when nothing is waiting', async () => {
    await telemetry.flush();
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
