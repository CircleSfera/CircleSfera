import { useEffect } from 'react';

// Clears selection when Escape is pressed and `active` is true. Escape closes
// one thing, the one on top: a dialog or a menu that took the key keeps the
// record under it open.
export function useAdminEscapeClear(active: boolean, onClear: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      onClear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onClear]);
}
