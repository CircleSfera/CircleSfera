import { useEffect, useState } from 'react';
import { WIDE_SCREEN_QUERY } from '../constants/breakpoints';

/** Whether the window is as wide as a desktop one, kept up as it changes. */
export function useWideScreen() {
  const [wide, setWide] = useState(
    () => window.matchMedia(WIDE_SCREEN_QUERY).matches,
  );
  useEffect(() => {
    const query = window.matchMedia(WIDE_SCREEN_QUERY);
    const onChange = () => setWide(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return wide;
}
