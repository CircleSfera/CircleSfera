import { useEffect, useState } from 'react';
import toast, { Toaster, useToasterStore } from 'react-hot-toast';

// How many notices are on screen at once; an older one leaves for a new one.
const MAX_VISIBLE = 3;

const WIDE = '(min-width: 768px)';

// Whether the window is as wide as a desktop one.
function useWideScreen() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const query = window.matchMedia(WIDE);
    const onChange = () => setWide(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return wide;
}

const DIALOG = '[role="dialog"][aria-modal="true"]';

// Whether a dialog is open, watched only while there is a notice to place:
// a dialog may open or close while the notice is on screen.
function useDialogOpen(watching: boolean) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!watching) {
      setOpen(false);
      return;
    }
    const look = () => setOpen(document.querySelector(DIALOG) !== null);
    look();
    const observer = new MutationObserver(look);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [watching]);
  return open;
}

/**
 * The one place the short notices of the app appear, in the dark surface of
 * the product. On phones they sit at the bottom, just above the navigation
 * bar; on desktop at the bottom left, beside the sidebar. On a phone with a
 * dialog open they move to the top, because the buttons of a dialog are at
 * its bottom.
 */
export function AppToaster() {
  const { toasts } = useToasterStore();
  const wide = useWideScreen();
  const overDialog = useDialogOpen(!wide && toasts.length > 0);

  useEffect(() => {
    toasts
      .filter((one) => one.visible)
      .slice(MAX_VISIBLE)
      .forEach((one) => {
        // Taken away at once: a notice that fades out is still on screen.
        toast.remove(one.id);
      });
  }, [toasts]);

  return (
    <Toaster
      position={
        wide ? 'bottom-left' : overDialog ? 'top-center' : 'bottom-center'
      }
      gutter={8}
      containerClassName="app-toaster"
      containerStyle={{
        top: 'var(--app-toaster-top)',
        bottom: 'var(--app-toaster-bottom)',
        left: 'var(--app-toaster-left)',
      }}
      toastOptions={{
        duration: 4000,
        className: 'app-toast',
        style: {
          background: 'var(--surface-raised)',
          color: '#ffffff',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '14px',
          padding: '10px 14px',
          fontSize: '14px',
          lineHeight: '20px',
          fontWeight: 500,
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.55)',
        },
        success: {
          iconTheme: { primary: '#4ade80', secondary: '#0a0a0a' },
        },
        // An error is read more slowly than a "saved".
        error: {
          duration: 6000,
          iconTheme: { primary: '#f87171', secondary: '#0a0a0a' },
        },
      }}
    />
  );
}
