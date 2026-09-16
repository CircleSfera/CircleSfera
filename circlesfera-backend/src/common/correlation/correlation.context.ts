import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import * as Sentry from '@sentry/nestjs';

export interface CorrelationStore {
  correlationId: string;
}

const storage = new AsyncLocalStorage<CorrelationStore>();

/**
 * Generates a non-sensitive unique correlation identifier.
 */
export function generateCorrelationId(): string {
  return `cs_${randomUUID().replace(/-/g, '')}`;
}

/**
 * Retrieves the current correlation ID if executing within an active correlation context.
 */
export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

/**
 * Executes a synchronous or asynchronous callback inside a correlation scope.
 */
export function runWithCorrelationId<T>(correlationId: string, fn: () => T): T {
  try {
    Sentry.setTag('correlation_id', correlationId);
  } catch {
    // Gracefully no-op if Sentry is uninitialized or in stripped test environments
  }
  return storage.run({ correlationId }, fn);
}

export const CorrelationContext = {
  generateId: generateCorrelationId,
  getId: getCorrelationId,
  run: runWithCorrelationId,
};
