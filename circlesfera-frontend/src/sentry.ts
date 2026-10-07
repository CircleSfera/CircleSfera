import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import { getCookieConsent } from './utils/cookieConsent';
import { scrubSentryPayload } from './utils/sentryScrub';

let sentryInitialized = false;

// Initialize Sentry only when analytics cookie consent is granted.
// Call again after the user accepts analytics in CookieConsent.
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
      // Explicit privacy settings, so a change of SDK defaults can never start
      // recording message text, form values or media.
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],
    environment: import.meta.env.MODE,
    // Sentry 11 collects personal data unless told otherwise: no user info,
    // cookies, headers or bodies, and no credential-like query parameters.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: {
        deny: ['token', 'secret', 'password', 'code', 'session', 'key', 'auth'],
      },
    },

    // Reset and verification links carry tokens in the URL: strip them from
    // everything sent to Sentry. Spans are streamed in Sentry 11, so
    // beforeSendSpan (not beforeSendTransaction) cleans trace data.
    beforeSend: (event) => scrubSentryPayload(event),
    beforeSendSpan: (span) => scrubSentryPayload(span),
    beforeBreadcrumb: (breadcrumb) => scrubSentryPayload(breadcrumb),

    // Performance Monitoring
    tracesSampleRate: isProd ? 0.1 : 1.0,

    // Session Replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });

  sentryInitialized = true;
}
