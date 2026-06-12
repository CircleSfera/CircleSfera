import { AxiosError } from 'axios';
import { logger } from './logger';

export function handleApiError(error: unknown): never {
  if (error instanceof AxiosError) {
    const serverMessage = error.response?.data?.message;
    const message = Array.isArray(serverMessage)
      ? serverMessage[0]
      : serverMessage || error.message || 'An unexpected error occurred';

    logger.error('API Error:', {
      status: error.response?.status,
      message,
      path: error.config?.url,
    });

    const customError = new Error(message) as Error & {
      status?: number;
      data?: unknown;
    };
    customError.status = error.response?.status;
    customError.data = error.response?.data;
    throw customError;
  }

  if (error instanceof Error) {
    logger.error('General Error:', error.message);
    throw error;
  }

  logger.error('Unknown Error:', error);
  throw new Error('An unexpected error occurred');
}
/**
 * Sanitizes URLs by normalizing localhost:3000 and ensuring relative paths
 * are prepended with the backend base URL.
 */
export function sanitizeUrl(
  url: string | null | undefined,
): string | undefined {
  if (!url) return undefined;

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const baseUrl = API_URL.replace(/\/api\/v1\/?$/, '');

  // 1. Convert http://localhost:3000/uploads/... to /uploads/...
  const processed = url.replace(
    /^https?:\/\/localhost:3000\/uploads/,
    '/uploads',
  );

  // 2. If it's a relative /uploads path, prepend the backend baseUrl
  if (processed.startsWith('/uploads')) {
    return `${baseUrl}${processed}`;
  }

  return processed;
}
