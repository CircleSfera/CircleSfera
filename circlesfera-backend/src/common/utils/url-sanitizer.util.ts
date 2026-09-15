const SENSITIVE_PARAM_NAMES = new Set([
  'token',
  'refreshtoken',
  'refresh_token',
  'accesstoken',
  'access_token',
  'secret',
  'password',
  'pass',
  'code',
  'authorization',
  'auth',
  'key',
  'apikey',
  'api_key',
  'sig',
  'signature',
  'credential',
]);

/**
 * Sanitizes sensitive query-string parameters from a URL or URI string
 * to prevent leaking secrets, credentials, or session tokens into application logs.
 */
export function sanitizeUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return rawUrl;
  }

  const qIndex = rawUrl.indexOf('?');
  if (qIndex === -1) {
    return rawUrl;
  }

  const pathname = rawUrl.slice(0, qIndex);
  const queryString = rawUrl.slice(qIndex + 1);

  if (!queryString) {
    return pathname;
  }

  try {
    const params = new URLSearchParams(queryString);
    for (const key of Array.from(params.keys())) {
      const lower = key.toLowerCase();
      if (
        SENSITIVE_PARAM_NAMES.has(lower) ||
        lower.includes('token') ||
        lower.includes('secret') ||
        lower.includes('password')
      ) {
        params.set(key, '[REDACTED]');
      }
    }
    const sanitizedQuery = params.toString();
    return sanitizedQuery ? `${pathname}?${sanitizedQuery}` : pathname;
  } catch {
    // Fail-safe: if query parsing fails, never leak raw query string
    return `${pathname}?[REDACTED]`;
  }
}
