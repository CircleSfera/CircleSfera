import { useEffect, useRef } from 'react';
import toast, {
  resolveValue,
  type Toast,
  ToastBar,
  Toaster,
  useToasterStore,
} from 'react-hot-toast';

/** How many notices are on screen at once: a new one replaces the last. */
export const MAX_VISIBLE = 1;
/** How long a notice stays, in ms; an error is read more slowly. */
export const NOTICE_MS = 3000;
export const ERROR_NOTICE_MS = 5000;
/** How far up a notice is swiped to close it, in px. */
export const SWIPE_CLOSE_PX = 24;

/** One notice: closed by a tap, or by swiping it up. */
function Notice({ notice }: { notice: Toast }) {
  const startY = useRef<number | null>(null);
  return (
    <ToastBar toast={notice}>
      {({ icon }) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: the notice is announced by its own live region; a tap or swipe only closes it early, as it closes on its own
        // biome-ignore lint/a11y/useKeyWithClickEvents: as above; it closes on its own and is never the only way to anything
        <div
          className="flex min-h-11 items-center gap-2"
          onClick={() => toast.dismiss(notice.id)}
          onPointerDown={(e) => {
            startY.current = e.clientY;
          }}
          onPointerUp={(e) => {
            if (
              startY.current !== null &&
              startY.current - e.clientY > SWIPE_CLOSE_PX
            ) {
              toast.dismiss(notice.id);
            }
            startY.current = null;
          }}
          style={{ touchAction: 'none' }}
        >
          {icon}
          {/* An error is announced at once; anything else when the reader
              is free. */}
          <div
            role={notice.type === 'error' ? 'alert' : 'status'}
            aria-live={notice.type === 'error' ? 'assertive' : 'polite'}
            className="flex-1 whitespace-pre-line py-2"
          >
            {resolveValue(notice.message, notice)}
          </div>
        </div>
      )}
    </ToastBar>
  );
}

/**
 * The one place the short notices of the app appear: a compact pill at the
 * top centre, below the top bar when there is one, centred on the content
 * beside the sidebar on a wide screen. It never covers a bar at the bottom,
 * a toolbar, a text field or the buttons of a dialog.
 */
export function AppToaster() {
  const { toasts } = useToasterStore();

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
      position="top-center"
      reverseOrder={false}
      gutter={8}
      containerClassName="app-toaster"
      containerStyle={{
        top: 'var(--app-toaster-top)',
        left: 'var(--app-toaster-left)',
        right: 'var(--app-toaster-right)',
      }}
      toastOptions={{
        duration: NOTICE_MS,
        className: 'app-toast',
        style: {
          background: 'var(--surface-raised)',
          color: '#ffffff',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '9999px',
          padding: '4px 16px',
          fontSize: '14px',
          lineHeight: '20px',
          fontWeight: 500,
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.55)',
        },
        success: {
          iconTheme: { primary: '#4ade80', secondary: '#0a0a0a' },
        },
        // Read more slowly, and announced at once.
        error: {
          duration: ERROR_NOTICE_MS,
          iconTheme: { primary: '#f87171', secondary: '#0a0a0a' },
        },
      }}
    >
      {(notice) => <Notice notice={notice} />}
    </Toaster>
  );
}
