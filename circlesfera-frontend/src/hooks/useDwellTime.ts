import { useEffect, useRef } from 'react';
import { analyticsApi } from '../services';

export function useDwellTime(
  postId: string,
  containerRef: React.RefObject<HTMLDivElement | null>,
) {
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || !postId) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          // Started viewing
          if (startTimeRef.current === null) {
            startTimeRef.current = Date.now();
          }
        } else {
          // Stopped viewing
          if (startTimeRef.current !== null) {
            const dwellTime = Date.now() - startTimeRef.current;
            if (dwellTime > 500) {
              // Only record if viewed for more than 500ms
              analyticsApi.queueDwellTimeEvent(postId, dwellTime);
            }
            startTimeRef.current = null;
          }
        }
      },
      {
        threshold: [0.0, 0.5, 1.0], // Trigger at these visibility thresholds
      },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      // Record any remaining time when component unmounts
      if (startTimeRef.current !== null) {
        const dwellTime = Date.now() - startTimeRef.current;
        if (dwellTime > 500) {
          analyticsApi.queueDwellTimeEvent(postId, dwellTime);
        }
      }
    };
  }, [postId, containerRef]);
}
