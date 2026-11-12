import type { ConfigService } from '@nestjs/config';
import { HealthIndicatorService } from '@nestjs/terminus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LIVEKIT_HEALTH_TIMEOUT_MS,
  LIVEKIT_UNSIGNED_STATUS,
  LiveKitHealthIndicator,
} from './livekit-health.indicator.js';

describe('LiveKitHealthIndicator', () => {
  let values: Record<string, string | undefined>;
  const fetchMock = vi.fn();

  const indicator = () =>
    new LiveKitHealthIndicator(
      { get: (key: string) => values[key] } as unknown as ConfigService,
      new HealthIndicatorService(),
    );

  beforeEach(() => {
    values = { LIVEKIT_URL: 'wss://live.example.test' };
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is up when the live service refuses a sign-in without a token, asked over http with a time limit', async () => {
    fetchMock.mockResolvedValue({ status: LIVEKIT_UNSIGNED_STATUS });

    await expect(indicator().pingCheck('live')).resolves.toEqual({
      live: { status: 'up' },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://live.example.test/rtc/validate',
      {
        signal: expect.any(AbortSignal),
      },
    );
  });

  it('asks the API address when one is set', async () => {
    values.LIVEKIT_API_URL = 'http://livekit:7880/';
    fetchMock.mockResolvedValue({ status: LIVEKIT_UNSIGNED_STATUS });

    await indicator().pingCheck('live');

    expect(fetchMock.mock.calls[0][0]).toBe('http://livekit:7880/rtc/validate');
  });

  it.each([
    [502, 'its proxy answers for it'],
    [200, 'the web app answers in its place'],
  ])('is down when it answers %i: %s', async (status) => {
    fetchMock.mockResolvedValue({ status });

    await expect(indicator().pingCheck('live')).resolves.toEqual({
      live: { status: 'down', message: `answered ${status}` },
    });
  });

  it('is down, without the error text, when the live service does not answer', async () => {
    fetchMock.mockRejectedValue(
      new Error('connect ECONNREFUSED 10.0.0.5:7880'),
    );

    await expect(indicator().pingCheck('live')).resolves.toEqual({
      live: { status: 'down', message: 'unreachable' },
    });
  });

  it('gives up after the time limit', async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementation(
        (_url: string, { signal }: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason));
          }),
      );
      const result = indicator().pingCheck('live');
      await vi.advanceTimersByTimeAsync(LIVEKIT_HEALTH_TIMEOUT_MS);

      await expect(result).resolves.toEqual({
        live: { status: 'down', message: 'unreachable' },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('is down when no live service is configured, without asking anything', async () => {
    values = {};

    await expect(indicator().pingCheck('live')).resolves.toEqual({
      live: { status: 'down', message: 'not configured' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
