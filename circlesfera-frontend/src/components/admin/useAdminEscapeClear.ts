import { useEffect } from 'react';

/** Clears selection when Escape is pressed and `active` is true. */
export function useAdminEscapeClear(active: boolean, onClear: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onClear]);
}
