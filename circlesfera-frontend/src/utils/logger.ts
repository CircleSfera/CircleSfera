// Development-only logger. All output is suppressed in production builds.
// Usage:
// Import { logger } from '../utils/logger';
// Logger.log('connected');
// Logger.warn('token expired');
// Logger.error('request failed', err);

const isDev = import.meta.env.DEV;

export const logger = {
  log: (...args: unknown[]) => {
    if (isDev) console.log(...args);
  },
  warn: (...args: unknown[]) => {
    if (isDev) console.warn(...args);
  },
  error: (...args: unknown[]) => {
    if (isDev) console.error(...args);
  },
  debug: (...args: unknown[]) => {
    if (isDev) console.debug(...args);
  },
};
