import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
vi.mock('./api', () => ({
  apiClient: { post, defaults: { baseURL: 'https://api.example/api/v1' } },
}));

// The service starts its timer and its page listener when it is loaded, so
// each test loads its own.
async function load() {
  vi.resetModules();
  const { analyticsApi } = await import('./analytics.service');
  return analyticsApi;
}
const events = (call = 0) =>
  (
    post.mock.calls[call][1] as {
      events: { targetId: string; dwellTime: number }[];
    }
  ).events;

describe('analyticsApi (time on a post)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    post.mockResolvedValue({});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('sends what is waiting every five seconds, as time spent on a post', async () => {
    const api = await load();
    api.queueDwellTimeEvent('post-1', 1200);
    api.queueDwellTimeEvent('post-2', 800);

    await vi.advanceTimersByTimeAsync(5000);

    expect(post).toHaveBeenCalledWith('/analytics/batch', {
      events: [
        {
          eventType: 'DWELL_TIME',
          targetId: 'post-1',
          targetType: 'POST',
          dwellTime: 1200,
        },
        {
          eventType: 'DWELL_TIME',
          targetId: 'post-2',
          targetType: 'POST',
          dwellTime: 800,
        },
      ],
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('sends at once when ten are waiting', async () => {
    const api = await load();
    for (let i = 0; i < 10; i++) api.queueDwellTimeEvent(`post-${i}`, 600);
    await vi.advanceTimersByTimeAsync(0);

    expect(events()).toHaveLength(10);
  });

  it('keeps the events of a failed send and sends them with the next ones, in order', async () => {
    post.mockRejectedValueOnce(new Error('down'));
    const api = await load();
    api.queueDwellTimeEvent('post-1', 700);
    await vi.advanceTimersByTimeAsync(5000);

    api.queueDwellTimeEvent('post-2', 900);
    await vi.advanceTimersByTimeAsync(5000);

    expect(events(1).map((e) => e.targetId)).toEqual(['post-1', 'post-2']);
  });

  it('does not start a second send while one is under way', async () => {
    let finish: () => void = () => {};
    post.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const api = await load();
    api.queueDwellTimeEvent('post-1', 700);
    await vi.advanceTimersByTimeAsync(5000);
    api.queueDwellTimeEvent('post-2', 700);
    await vi.advanceTimersByTimeAsync(5000);
    expect(post).toHaveBeenCalledTimes(1);

    finish();
    await vi.advanceTimersByTimeAsync(5000);
    expect(post).toHaveBeenCalledTimes(2);
  });

  describe('leaving the page', () => {
    const leave = () => window.dispatchEvent(new Event('beforeunload'));

    it('hands what is waiting to the browser, which delivers it after the page is gone', async () => {
      const sendBeacon = vi.fn();
      vi.stubGlobal('navigator', { sendBeacon });
      const api = await load();
      api.queueDwellTimeEvent('post-1', 700);

      leave();

      const [url, body] = sendBeacon.mock.calls[0];
      expect(url).toBe('https://api.example/api/v1/analytics/batch');
      expect(JSON.parse(await (body as Blob).text())).toEqual({
        events: [
          expect.objectContaining({ targetId: 'post-1', dwellTime: 700 }),
        ],
      });
      // Handed over once: nothing is sent again.
      await vi.advanceTimersByTimeAsync(5000);
      expect(post).not.toHaveBeenCalled();
    });

    it('sends it the usual way in a browser without that', async () => {
      vi.stubGlobal('navigator', {});
      const api = await load();
      api.queueDwellTimeEvent('post-1', 700);

      leave();

      expect(post).toHaveBeenCalledWith('/analytics/batch', {
        events: [expect.objectContaining({ targetId: 'post-1' })],
      });
    });

    it('does nothing when nothing is waiting, and never breaks the page when the hand-over fails', async () => {
      const sendBeacon = vi.fn(() => {
        throw new Error('refused');
      });
      vi.stubGlobal('navigator', { sendBeacon });
      const api = await load();

      leave();
      expect(sendBeacon).not.toHaveBeenCalled();

      api.queueDwellTimeEvent('post-1', 700);
      expect(() => leave()).not.toThrow();
    });
  });
});
