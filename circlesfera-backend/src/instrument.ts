import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const isProd = process.env.NODE_ENV === 'production';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [nodeProfilingIntegration()],
  environment: process.env.NODE_ENV || 'development',
  // Performance Monitoring
  tracesSampleRate: isProd ? 0.1 : 1.0, //  Capture 10% in prod, 100% in dev
  // Set sampling rate for profiling - this is relative to tracesSampleRate
  profilesSampleRate: isProd ? 0.1 : 1.0,
});
