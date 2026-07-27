import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import { getCookieConsent } from './utils/cookieConsent';

let sentryInitialized = false;

/**
 * Initialize Sentry only when analytics cookie consent is granted.
 * Call again after the user accepts analytics in CookieConsent.
 */
export function initSentry() {
  if (sentryInitialized) return;

  const consent = getCookieConsent();
  if (!consent?.analytics) {
    // Sentry waits until analytics is accepted (cs_cookie_consent.analytics).
    return;
  }

  const isProd = import.meta.env.MODE === 'production';

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN || '',
    integrations: [
      Sentry.reactRouterV6BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
      Sentry.replayIntegration(),
    ],
    environment: import.meta.env.MODE,

    // Performance Monitoring
    tracesSampleRate: isProd ? 0.1 : 1.0,

    // Session Replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });

  sentryInitialized = true;
}
