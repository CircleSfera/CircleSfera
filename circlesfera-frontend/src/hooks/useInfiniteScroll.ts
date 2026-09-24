import { useCallback, useEffect, useState } from 'react';

// Observes a sentinel element and calls fetchNextPage when it enters the
// viewport. Returns a callback ref rather than a useRef object: the sentinel
// can mount later than this hook's first render (e.g. inside a lazy()-loaded
// modal), and a plain ref object's mutation wouldn't re-run this effect —
// the observer would just never attach. A callback ref fires on every mount,
// however late, and storing the node in state re-triggers the effect below.
export function useInfiniteScroll(
  fetchNextPage: () => void,
  hasNextPage: boolean | undefined,
  isFetchingNextPage: boolean,
) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const loadMoreRef = useCallback((el: HTMLDivElement | null) => {
    setNode(el);
  }, []);

  useEffect(() => {
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [node, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return loadMoreRef;
}
