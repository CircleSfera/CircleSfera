import { act, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useExperimentStore } from '../stores/useExperimentStore';
import { useDebounce } from './useDebounce';
import { useExperimentsLoaded, useFeatureFlag } from './useFeatureFlag';
import { useInfiniteScroll } from './useInfiniteScroll';

describe('useDebounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs once, with the last arguments, after the calls stop', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebounce(callback, 500));

    result.current('a');
    vi.advanceTimersByTime(300);
    result.current('ab');
    vi.advanceTimersByTime(499);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('ab');
  });

  it('runs again for a call made after the wait', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebounce(callback, 100));

    result.current('one');
    vi.advanceTimersByTime(100);
    result.current('two');
    vi.advanceTimersByTime(100);

    expect(callback.mock.calls).toEqual([['one'], ['two']]);
  });

  it('drops a waiting call when the screen goes away', () => {
    const callback = vi.fn();
    const { result, unmount } = renderHook(() => useDebounce(callback, 500));

    result.current('late');
    unmount();
    vi.advanceTimersByTime(1000);

    expect(callback).not.toHaveBeenCalled();
  });
});

describe('feature switches', () => {
  beforeEach(() => useExperimentStore.setState({ flags: {}, isLoaded: false }));

  it('reads a switch as off until it is known to be on', () => {
    const { result } = renderHook(() => useFeatureFlag('new_feed'));
    expect(result.current).toBe(false);

    act(() => useExperimentStore.getState().setFlags({ new_feed: true }));
    expect(result.current).toBe(true);

    act(() => useExperimentStore.getState().setFlags({ new_feed: false }));
    expect(result.current).toBe(false);
  });

  it('says when the switches have been read', () => {
    const { result } = renderHook(() => useExperimentsLoaded());
    expect(result.current).toBe(false);

    act(() => useExperimentStore.getState().setFlags({}));
    expect(result.current).toBe(true);
  });
});

describe('useInfiniteScroll', () => {
  type Seen = (entries: { isIntersecting: boolean }[]) => void;
  let seen: Seen;
  let options: IntersectionObserverInit | undefined;
  const observe = vi.fn();
  const disconnect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: Seen, given?: IntersectionObserverInit) {
          seen = callback;
          options = given;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  function List({
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage = false,
    withSentinel = true,
  }: {
    fetchNextPage: () => void;
    hasNextPage?: boolean;
    isFetchingNextPage?: boolean;
    withSentinel?: boolean;
  }) {
    const ref = useInfiniteScroll(
      fetchNextPage,
      hasNextPage,
      isFetchingNextPage,
    );
    return withSentinel ? <div ref={ref} data-testid="sentinel" /> : null;
  }

  it('asks for the next page when the end comes near, a little before it shows', () => {
    const fetchNextPage = vi.fn();
    const { getByTestId } = render(
      <List fetchNextPage={fetchNextPage} hasNextPage />,
    );

    expect(observe).toHaveBeenCalledWith(getByTestId('sentinel'));
    expect(options).toEqual({ rootMargin: '200px' });

    act(() => seen([{ isIntersecting: true }]));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the end is not in view', { hasNextPage: true }, false],
    ['there is no next page', { hasNextPage: false }, true],
    ['it is not known whether there is one', {}, true],
    [
      'a page is already on its way',
      { hasNextPage: true, isFetchingNextPage: true },
      true,
    ],
  ])('does not ask when %s', (_why, props, isIntersecting) => {
    const fetchNextPage = vi.fn();
    render(<List fetchNextPage={fetchNextPage} {...props} />);

    act(() => seen([{ isIntersecting }]));
    act(() => seen([]));

    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('starts watching an end that appears later, and stops when it goes', () => {
    const fetchNextPage = vi.fn();
    const { rerender, unmount } = render(
      <List fetchNextPage={fetchNextPage} hasNextPage withSentinel={false} />,
    );
    expect(observe).not.toHaveBeenCalled();

    rerender(<List fetchNextPage={fetchNextPage} hasNextPage />);
    expect(observe).toHaveBeenCalledTimes(1);

    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
