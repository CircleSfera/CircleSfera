import { useEffect, useState } from 'react';

/**
 * Debounce a value by a given delay.
 * Returns the debounced value that only updates after the delay has elapsed
 * since the last change.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
