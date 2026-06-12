/**
 * Development-only logger. All output is suppressed in production builds.
 *
 * Usage:
 *   import { logger } from '../utils/logger';
 *   logger.log('connected');
 *   logger.warn('token expired');
 *   logger.error('request failed', err);
 */

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
