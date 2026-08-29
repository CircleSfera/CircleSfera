import { useCallback, useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          'error-callback'?: () => void;
          'expired-callback'?: () => void;
          theme?: 'dark' | 'light' | 'auto';
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const SCRIPT_ID = 'cf-turnstile-script';
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  const existing = document.getElementById(SCRIPT_ID);
  if (existing) {
    return new Promise((resolve) => {
      existing.addEventListener('load', () => resolve());
      if (window.turnstile) resolve();
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src =
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Turnstile script failed'));
    document.head.appendChild(script);
  });
}

/** Cloudflare Turnstile widget. Renders nothing if site key is unset (local/dev). */
export default function TurnstileWidget({
  onToken,
}: {
  onToken: (token: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  const reset = useCallback(() => {
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
    onToken(null);
  }, [onToken]);

  useEffect(() => {
    if (!SITE_KEY || !containerRef.current) {
      onToken(null);
      return;
    }

    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          theme: 'dark',
          callback: (token) => onToken(token),
          'error-callback': () => onToken(null),
          'expired-callback': () => onToken(null),
        });
        setReady(true);
      })
      .catch(() => onToken(null));

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
      }
    };
  }, [onToken]);

  if (!SITE_KEY) {
    if (import.meta.env.PROD) {
      return (
        <p className="text-amber-400/90 text-xs text-center px-2">
          Security check unavailable. Refresh the page in a minute or try again
          after the latest deploy finishes.
        </p>
      );
    }
    return null;
  }

  return (
    <div className="flex justify-center min-h-16" data-ready={ready}>
      <div ref={containerRef} />
      <button type="button" className="sr-only" onClick={reset}>
        Reset captcha
      </button>
    </div>
  );
}
