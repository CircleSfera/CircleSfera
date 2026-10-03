// Removes credentials from URLs and Sentry payloads before they leave the
// browser. Password reset and email verification links carry a single-use
// token in the query string, and Sentry records page URLs in traces and
// breadcrumbs.

const REDACTED = '[REDACTED]';

// Query parameter names whose values must never be sent to telemetry.
const SENSITIVE_PARAM =
  /token|secret|password|passwd|code|signature|session_id|api[_-]?key|auth/i;

function scrubQuery(query: string): string {
  return query
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      if (eq === -1) return pair;
      const name = pair.slice(0, eq);
      let decoded = name;
      try {
        decoded = decodeURIComponent(name);
      } catch {
        // Keep the raw name when it is not valid percent-encoding.
      }
      return SENSITIVE_PARAM.test(decoded) ? `${name}=${REDACTED}` : pair;
    })
    .join('&');
}

// Redacts sensitive query parameters in every URL found in the text, whether
// absolute (https://…?token=…) or relative (/reset-password?token=…).
export function scrubUrl(value: string): string {
  return value.replace(/\?([^#\s"']*)/g, (_match, query: string) => {
    return `?${scrubQuery(query)}`;
  });
}

type Scrubbable = Record<string, unknown>;

function scrubValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') return scrubUrl(value);
  if (depth > 5 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  const out: Scrubbable = {};
  for (const [key, inner] of Object.entries(value as Scrubbable)) {
    out[key] = scrubValue(inner, depth + 1);
  }
  return out;
}

// Applies scrubUrl to every string in a Sentry event, transaction or
// breadcrumb (request URL, transaction name, span descriptions, breadcrumb
// data such as navigation `from`/`to`).
export function scrubSentryPayload<T>(payload: T): T {
  return scrubValue(payload, 0) as T;
}
