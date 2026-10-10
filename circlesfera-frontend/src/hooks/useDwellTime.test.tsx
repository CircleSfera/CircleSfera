import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyticsApi } from '../services';
import { useDwellTime } from './useDwellTime';

vi.mock('../services', () => ({
  analyticsApi: { queueDwellTimeEvent: vi.fn() },
}));

type Entry = { isIntersecting: boolean; intersectionRatio: number };
let notify: (entry: Entry) => void = () => {};
const observe = vi.fn();
const disconnect = vi.fn();
let options: IntersectionObserverInit | undefined;

function Post({ postId, attach = true }: { postId: string; attach?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useDwellTime(postId, ref);
  return attach ? <div ref={ref} /> : null;
}

describe('useDwellTime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(
          callback: (entries: Entry[]) => void,
          given?: IntersectionObserverInit,
        ) {
          notify = (entry) => callback([entry]);
          options = given;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const seen = { isIntersecting: true, intersectionRatio: 0.6 };
  const gone = { isIntersecting: false, intersectionRatio: 0 };

  it('records how long a post was at least half on screen, once it leaves', () => {
    render(<Post postId="post-1" />);
    expect(observe).toHaveBeenCalledTimes(1);
    expect(options?.threshold).toEqual([0.0, 0.5, 1.0]);

    notify(seen);
    vi.advanceTimersByTime(1800);
    notify(gone);

    expect(analyticsApi.queueDwellTimeEvent).toHaveBeenCalledWith(
      'post-1',
      1800,
    );
  });

  it('does not count a post less than half on screen, nor a glance of half a second', () => {
    render(<Post postId="post-1" />);

    notify({ isIntersecting: true, intersectionRatio: 0.3 });
    vi.advanceTimersByTime(5000);
    notify(gone);

    notify(seen);
    vi.advanceTimersByTime(500);
    notify(gone);

    expect(analyticsApi.queueDwellTimeEvent).not.toHaveBeenCalled();
  });

  it('keeps one start while the post stays on screen, and starts again after it left', () => {
    render(<Post postId="post-1" />);

    notify(seen);
    vi.advanceTimersByTime(1000);
    notify({ isIntersecting: true, intersectionRatio: 1 });
    vi.advanceTimersByTime(1000);
    notify(gone);
    notify(seen);
    vi.advanceTimersByTime(700);
    notify(gone);

    expect(vi.mocked(analyticsApi.queueDwellTimeEvent).mock.calls).toEqual([
      ['post-1', 2000],
      ['post-1', 700],
    ]);
  });

  it('records the time still running when the post is removed, and stops watching', () => {
    const { unmount } = render(<Post postId="post-1" />);

    notify(seen);
    vi.advanceTimersByTime(900);
    unmount();

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(analyticsApi.queueDwellTimeEvent).toHaveBeenCalledWith(
      'post-1',
      900,
    );
  });

  it.each([
    ['no post', { postId: '' }],
    ['nothing on the page to watch', { postId: 'post-1', attach: false }],
  ])('watches nothing with %s', (_case, props) => {
    render(<Post {...props} />);
    expect(observe).not.toHaveBeenCalled();
  });
});
