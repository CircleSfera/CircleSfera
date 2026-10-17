import { describe, expect, it, vi } from 'vitest';
import { reloadOnceForStaleBuild, watchForStaleBuild } from './staleBuild';

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

describe('reloadOnceForStaleBuild', () => {
  it('reloads once, and not again within a minute', () => {
    const storage = memory();
    const reload = vi.fn();

    expect(reloadOnceForStaleBuild(storage, reload, 1_000_000)).toBe(true);
    expect(reloadOnceForStaleBuild(storage, reload, 1_030_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);

    // A later deploy, a minute after, may reload again.
    expect(reloadOnceForStaleBuild(storage, reload, 1_061_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('does not reload when the tab cannot remember it did', () => {
    const reload = vi.fn();
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => undefined,
    };

    expect(reloadOnceForStaleBuild(broken, reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('watchForStaleBuild', () => {
  it('listens for a piece of the app that failed to load', () => {
    const target = { addEventListener: vi.fn() } as unknown as Window;
    watchForStaleBuild(target);
    expect(target.addEventListener).toHaveBeenCalledWith(
      'vite:preloadError',
      expect.any(Function),
    );
  });

  it('reloads and keeps the error from surfacing', () => {
    window.sessionStorage.clear();
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, reload },
    });
    let handler: ((e: Event) => void) | undefined;
    const target = {
      addEventListener: (_: string, h: (e: Event) => void) => {
        handler = h;
      },
    } as unknown as Window;
    watchForStaleBuild(target);
    const event = { preventDefault: vi.fn() } as unknown as Event;

    handler!(event);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: original,
    });
  });
});
