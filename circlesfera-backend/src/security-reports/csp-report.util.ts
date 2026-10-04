// Normalizes Content-Security-Policy violation reports sent by browsers into
// a small summary that is safe to log. Reports can contain full page URLs
// (for example a password reset link with its token), so only the origin of
// the blocked resource and the path of the page are kept.

export interface CspViolationSummary {
  directive: string;
  blocked: string;
  page: string;
  disposition: string;
}

const MAX_FIELD = 200;

function clip(value: string): string {
  return value.length > MAX_FIELD ? value.slice(0, MAX_FIELD) : value;
}

// Keeps keywords such as `inline`, `eval` or `data` as they are; reduces URLs
// to their origin.
export function toBlockedOrigin(value: unknown): string {
  if (typeof value !== 'string' || value === '') return 'unknown';
  try {
    const url = new URL(value);
    if (
      url.protocol === 'http:' ||
      url.protocol === 'https:' ||
      url.protocol === 'wss:' ||
      url.protocol === 'ws:'
    ) {
      return clip(url.origin);
    }
    return clip(url.protocol.replace(':', ''));
  } catch {
    return clip(value.replace(/[^a-z-]/gi, '')) || 'unknown';
  }
}

// Keeps only the path of the page: no query string, no fragment.
export function toPagePath(value: unknown): string {
  if (typeof value !== 'string' || value === '') return 'unknown';
  try {
    return clip(new URL(value).pathname);
  } catch {
    return 'unknown';
  }
}

function field(obj: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (obj[name] !== undefined) return obj[name];
  }
  return undefined;
}

function summarize(raw: Record<string, unknown>): CspViolationSummary {
  const directive = field(
    raw,
    'effective-directive',
    'effectiveDirective',
    'violated-directive',
    'violatedDirective',
  );
  return {
    directive:
      typeof directive === 'string' ? clip(directive.split(' ')[0]) : 'unknown',
    blocked: toBlockedOrigin(field(raw, 'blocked-uri', 'blockedURL')),
    page: toPagePath(field(raw, 'document-uri', 'documentURL')),
    disposition:
      typeof raw.disposition === 'string' ? clip(raw.disposition) : 'unknown',
  };
}

// Accepts both formats: the legacy `report-uri` body
// ({ "csp-report": {...} }) and the Reporting API array
// ([{ type: "csp-violation", body: {...} }]).
export function parseCspReports(body: unknown): CspViolationSummary[] {
  if (Array.isArray(body)) {
    return body
      .filter(
        (r): r is { type: string; body: Record<string, unknown> } =>
          !!r &&
          typeof r === 'object' &&
          (r as { type?: unknown }).type === 'csp-violation' &&
          typeof (r as { body?: unknown }).body === 'object' &&
          (r as { body?: unknown }).body !== null,
      )
      .slice(0, 20)
      .map((r) => summarize(r.body));
  }
  if (body && typeof body === 'object') {
    const report = (body as Record<string, unknown>)['csp-report'];
    if (report && typeof report === 'object') {
      return [summarize(report as Record<string, unknown>)];
    }
  }
  return [];
}
