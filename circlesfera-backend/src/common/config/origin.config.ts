/**
 * Canonical development origins permitted for local API, admin, and WebSocket consumption.
 */
export const DEFAULT_DEV_ORIGINS: readonly string[] = [
  'http://localhost:5173',
  'http://admin.localhost:5173',
  'http://localhost:8080',
  'http://localhost:8081',
  'http://[::1]:5173',
];

/**
 * Parses and validates permitted HTTP origins from environment configuration.
 * Enforces CORS_ORIGIN requirement in production to prevent open origin reflection.
 */
export function parseAllowedOrigins(
  corsOriginEnv?: string,
  isProd = false,
): string[] {
  if (!corsOriginEnv || corsOriginEnv.trim() === '') {
    if (isProd) {
      throw new Error(
        'CORS_ORIGIN environment variable is required in production',
      );
    }
    return [...DEFAULT_DEV_ORIGINS];
  }

  const parsed = corsOriginEnv
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (parsed.length === 0) {
    if (isProd) {
      throw new Error(
        'CORS_ORIGIN environment variable is required in production',
      );
    }
    return [...DEFAULT_DEV_ORIGINS];
  }

  return parsed;
}

/**
 * Derives explicit WebSocket counterpart origins from permitted HTTP origins.
 * Converts http:// to ws:// and https:// to wss://, eliminating blanket wss://* wildcards.
 */
export function deriveWebSocketOrigins(httpOrigins: string[]): string[] {
  const wsOrigins = new Set<string>();

  for (const origin of httpOrigins) {
    if (!origin) continue;
    if (origin.startsWith('https://')) {
      wsOrigins.add(origin.replace(/^https:\/\//, 'wss://'));
    } else if (origin.startsWith('http://')) {
      wsOrigins.add(origin.replace(/^http:\/\//, 'ws://'));
    }
  }

  // Include localhost WebSocket variants in non-production environments
  if (
    httpOrigins.some((o) => o.includes('localhost') || o.includes('127.0.0.1'))
  ) {
    wsOrigins.add('ws://localhost:3000');
    wsOrigins.add('ws://127.0.0.1:3000');
  }

  return Array.from(wsOrigins);
}

/**
 * Strictly verifies whether an incoming request Origin header is permitted.
 */
export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  if (!origin) return false;
  return allowedOrigins.includes(origin);
}

export interface CspOptions {
  allowedOrigins: string[];
  allowedWsOrigins?: string[];
  livekitUrl?: string;
  cdnUrl?: string;
  isProd?: boolean;
  isSwagger?: boolean;
}

/**
 * Builds least-privilege Content Security Policy (CSP) directives.
 * Removes unnecessary inline allowances from standard API endpoints,
 * preserves Swagger UI functionality on documentation routes,
 * and restricts WebSocket connectivity to explicit allowed origins.
 */
export function createCspDirectives(options: CspOptions) {
  const wsOrigins =
    options.allowedWsOrigins || deriveWebSocketOrigins(options.allowedOrigins);
  const livekitSources = options.livekitUrl ? [options.livekitUrl] : [];
  const cdnSources = options.cdnUrl ? [options.cdnUrl] : [];

  const connectSources = [
    "'self'",
    ...options.allowedOrigins,
    ...wsOrigins,
    ...livekitSources,
    'https://*.sentry.io',
    'https://*.ingest.sentry.io',
  ];

  return {
    defaultSrc: ["'self'"],
    scriptSrc: options.isSwagger ? ["'self'", "'unsafe-inline'"] : ["'self'"],
    styleSrc: options.isSwagger
      ? ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com']
      : ["'self'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    imgSrc: [
      "'self'",
      'data:',
      'https://res.cloudinary.com',
      ...cdnSources,
      ...options.allowedOrigins,
    ],
    mediaSrc: [
      "'self'",
      'blob:',
      'https://res.cloudinary.com',
      ...cdnSources,
      ...options.allowedOrigins,
    ],
    connectSrc: connectSources,
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    upgradeInsecureRequests: options.isProd ? [] : null,
  };
}
