import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { PullToRefresh } from './PullToRefresh';

const device = vi.hoisted(() => ({ isNative: false, impact: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => device.isNative },
}));
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: device.impact },
  ImpactStyle: { Light: 'LIGHT' },
}));

function show(onRefresh = vi.fn().mockResolvedValue(undefined)) {
  const view = renderWithProviders(
    <PullToRefresh onRefresh={onRefresh}>
      <p>feed</p>
    </PullToRefresh>,
  );
  const area = view.container.firstElementChild as HTMLElement;
  const content = screen.getByText('feed').parentElement as HTMLElement;
  return { onRefresh, area, content, ...view };
}
const touch = (clientY: number) => ({ touches: [{ clientY }] });
/**
 * How far down the content has been pulled, in px. Read from the spinner,
 * which turns three degrees for each one: the position of the content itself
 * is only written to the page on the next frame.
 */
const pulled = (content: HTMLElement) => {
  const spinner = content.parentElement?.querySelector('svg') as SVGElement;
  return (
    Number(/rotate\(([\d.]+)deg\)/.exec(spinner.style.transform)?.[1] ?? 0) / 3
  );
};

/** Presses at the top and drags down by a number of px, without letting go. */
function drag(area: HTMLElement, by: number) {
  fireEvent.touchStart(area, touch(100));
  return fireEvent.touchMove(area, touch(100 + by));
}

describe('PullToRefresh', () => {
  const vibrate = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    device.isNative = false;
    device.impact.mockResolvedValue(undefined);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: vibrate,
    });
  });
  afterEach(() => {
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: undefined,
    });
  });

  it('follows the finger at half its distance, up to a limit, and holds the page still', () => {
    const { area, content } = show();

    const allowed = drag(area, 100);
    expect(pulled(content)).toBe(50);
    expect(allowed).toBe(false);

    fireEvent.touchMove(area, touch(900));
    expect(pulled(content)).toBe(120);
  });

  it('refreshes when let go past the mark, with a short vibration, and comes back up', async () => {
    let finish: () => void = () => {};
    const onRefresh = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    const { area, content, container } = show(onRefresh);

    drag(area, 200);
    await act(async () => {
      fireEvent.touchEnd(area);
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(50);
    expect(container.querySelector('.animate-spin')).not.toBeNull();

    await act(async () => finish());
    expect(container.querySelector('.animate-spin')).toBeNull();
    expect(pulled(content)).toBe(0);
  });

  it('goes back up without refreshing when let go before the mark', async () => {
    const { area, content, onRefresh } = show();

    drag(area, 100);
    await act(async () => {
      fireEvent.touchEnd(area);
    });

    expect(onRefresh).not.toHaveBeenCalled();
    expect(pulled(content)).toBe(0);
  });

  it('goes back up without refreshing when the system takes the touch away', async () => {
    const { area, content, onRefresh } = show();

    drag(area, 200);
    await act(async () => {
      fireEvent.touchCancel(area);
    });

    expect(pulled(content)).toBe(0);
    await act(async () => {
      fireEvent.touchEnd(area);
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('does nothing when the page is not at the top', async () => {
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 300,
    });
    const { area, content, onRefresh } = show();

    const allowed = drag(area, 200);
    await act(async () => {
      fireEvent.touchEnd(area);
      fireEvent.touchCancel(area);
    });

    expect(allowed).toBe(true);
    expect(pulled(content)).toBe(0);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('lets the page scroll when the finger moves up', () => {
    const { area, content } = show();
    fireEvent.touchStart(area, touch(300));

    const allowed = fireEvent.touchMove(area, touch(100));

    expect(allowed).toBe(true);
    expect(pulled(content)).toBe(0);
  });

  it('takes no second pull while it is refreshing', async () => {
    const onRefresh = vi.fn(() => new Promise<void>(() => {}));
    const { area } = show(onRefresh);
    drag(area, 200);
    await act(async () => {
      fireEvent.touchEnd(area);
    });

    drag(area, 200);
    await act(async () => {
      fireEvent.touchEnd(area);
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('uses the tap of the device in the native app', async () => {
    device.isNative = true;
    const { area } = show();
    drag(area, 200);
    await act(async () => {
      fireEvent.touchEnd(area);
    });

    expect(device.impact).toHaveBeenCalledWith({ style: 'LIGHT' });
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('refreshes all the same on a device that cannot vibrate', async () => {
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: undefined,
    });
    const { area, onRefresh } = show();
    drag(area, 200);
    await act(async () => {
      fireEvent.touchEnd(area);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('comes back up when the refresh fails', async () => {
    const { area, content, container } = show(
      vi.fn().mockRejectedValue(new Error('offline')),
    );

    drag(area, 200);
    await act(async () => {
      fireEvent.touchEnd(area);
    });

    expect(container.querySelector('.animate-spin')).toBeNull();
    expect(pulled(content)).toBe(0);
  });

  it('stops listening when it goes away', () => {
    const { area, unmount } = show();
    const remove = vi.spyOn(area, 'removeEventListener');
    unmount();
    expect(remove.mock.calls.map(([name]) => name).sort()).toEqual([
      'touchcancel',
      'touchend',
      'touchmove',
      'touchstart',
    ]);
  });
});
