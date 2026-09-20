import { sanitizeUrl } from '../utils/url-sanitizer.util.js';

const RAW_SENSITIVE_KEYS: readonly string[] = [
  'password',
  'current_password',
  'currentpassword',
  'new_password',
  'newpassword',
  'confirm_password',
  'confirmpassword',
  'old_password',
  'oldpassword',
  'pass',
  'passwd',
  'token',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'id_token',
  'idtoken',
  'auth_token',
  'authtoken',
  'reset_token',
  'resettoken',
  'verification_token',
  'verificationtoken',
  'csrf_token',
  'csrftoken',
  'csrf',
  '_csrf',
  'x-csrf-token',
  'xcsrftoken',
  'secret',
  'client_secret',
  'clientsecret',
  'jwt_secret',
  'jwtsecret',
  'webhook_secret',
  'webhooksecret',
  'stripe_signature',
  'stripesignature',
  'authorization',
  'auth',
  'cookie',
  'cookies',
  'set-cookie',
  'setcookie',
  'x-api-key',
  'xapikey',
  'api_key',
  'apikey',
  'totp_secret',
  'totpsecret',
  'totp_code',
  'totpcode',
  'two_factor_secret',
  'twofactorsecret',
  'two_factor_code',
  'twofactorcode',
  'card',
  'card_number',
  'cardnumber',
  'credit_card',
  'creditcard',
  'cvv',
  'cvc',
  'exp_month',
  'expmonth',
  'exp_year',
  'expyear',
  'payment_method',
  'paymentmethod',
  'private_key',
  'privatekey',
  'credentials',
  'credential',
];

export const SENSITIVE_KEY_NAMES: ReadonlySet<string> = new Set([
  ...RAW_SENSITIVE_KEYS.map((k) => k.toLowerCase()),
  ...RAW_SENSITIVE_KEYS.map((k) => k.toLowerCase().replace(/[-_]/g, '')),
]);

const JWT_REGEX = /eyJ[A-Za-z0-9-_]{10,}\.[A-Za-z0-9-_]{10,}\.[A-Za-z0-9-_]+/g;
const STRIPE_SECRET_KEY_REGEX = /(?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{24,}/g;
const STRIPE_WEBHOOK_SECRET_REGEX = /whsec_[0-9a-zA-Z]{32,}/g;
const STRIPE_CLIENT_SECRET_REGEX = /pi_[0-9a-zA-Z]+_secret_[0-9a-zA-Z]+/g;
const BEARER_TOKEN_REGEX = /Bearer\s+[A-Za-z0-9-_.~+/]+=*/gi;
const BASIC_AUTH_REGEX = /Basic\s+[A-Za-z0-9+/=]+/gi;
const CONNECTION_STRING_PASSWORD_REGEX =
  /((?:postgres|postgresql|redis|rediss|mongodb|mysql|mariadb|amqp|amqps):\/\/[^:]+:)([^@]+)(@)/gi;
const S3_SIGNED_SIGNATURE_REGEX = /X-Amz-Signature=[0-9a-fA-F]+/gi;
const S3_SIGNED_CREDENTIAL_REGEX = /X-Amz-Credential=[^&\s]+/gi;

export const REDACTED_CENSOR = '[REDACTED]';

/**
 * Checks whether a given field key is considered sensitive.
 */
export function isSensitiveKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const normalized = key.trim().toLowerCase().replace(/[-_]/g, '');

  if (SENSITIVE_KEY_NAMES.has(normalized)) return true;

  // Partial match heuristic for compound keys (e.g. userPassword, stripeClientSecret)
  if (
    normalized.includes('password') ||
    normalized.includes('refreshtoken') ||
    normalized.includes('accesstoken') ||
    normalized.includes('idtoken') ||
    normalized.includes('authtoken') ||
    normalized.includes('resettoken') ||
    normalized.includes('clientsecret') ||
    normalized.includes('webhooksecret') ||
    normalized.includes('jwtsecret') ||
    normalized.includes('cardnumber') ||
    normalized.includes('creditcard') ||
    normalized.includes('totpsecret') ||
    normalized.includes('privatekey') ||
    normalized.includes('csrftoken') ||
    normalized.includes('stripesignature') ||
    normalized.includes('setcookie')
  ) {
    return true;
  }

  return false;
}

/**
 * Pattern-based string redaction masking JWTs, API keys, credentials,
 * and database passwords in free-form text, error messages, and stack traces.
 */
export function redactSensitiveText(text: string): string {
  if (!text || typeof text !== 'string') return text;

  let sanitized = text;

  // Redact JWT tokens
  sanitized = sanitized.replace(JWT_REGEX, '[REDACTED_JWT]');

  // Redact Stripe secret/restricted API keys
  sanitized = sanitized.replace(
    STRIPE_SECRET_KEY_REGEX,
    '[REDACTED_STRIPE_KEY]',
  );

  // Redact Stripe webhook secrets
  sanitized = sanitized.replace(
    STRIPE_WEBHOOK_SECRET_REGEX,
    '[REDACTED_STRIPE_WEBHOOK_SECRET]',
  );

  // Redact Stripe payment intent client secrets
  sanitized = sanitized.replace(
    STRIPE_CLIENT_SECRET_REGEX,
    '[REDACTED_STRIPE_CLIENT_SECRET]',
  );

  // Redact Authorization headers / bearer tokens
  sanitized = sanitized.replace(BEARER_TOKEN_REGEX, 'Bearer [REDACTED]');
  sanitized = sanitized.replace(BASIC_AUTH_REGEX, 'Basic [REDACTED]');

  // Redact database / broker connection strings passwords
  sanitized = sanitized.replace(
    CONNECTION_STRING_PASSWORD_REGEX,
    `$1${REDACTED_CENSOR}$3`,
  );

  // Redact S3 signed query parameters
  sanitized = sanitized.replace(
    S3_SIGNED_SIGNATURE_REGEX,
    `X-Amz-Signature=${REDACTED_CENSOR}`,
  );
  sanitized = sanitized.replace(
    S3_SIGNED_CREDENTIAL_REGEX,
    `X-Amz-Credential=${REDACTED_CENSOR}`,
  );

  return sanitized;
}

/**
 * Deeply and recursively sanitizes objects and arrays, replacing values of sensitive
 * keys with '[REDACTED]' and scrubbing text strings for embedded credentials.
 */
export function redactSensitiveData<T>(
  input: T,
  maxDepth = 10,
  seen = new WeakSet(),
): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    return redactSensitiveText(input) as unknown as T;
  }

  if (typeof input !== 'object' || maxDepth <= 0) {
    return input;
  }

  // Prevent circular references
  if (seen.has(input as object)) {
    return '[CIRCULAR]' as unknown as T;
  }
  seen.add(input as object);

  if (Array.isArray(input)) {
    return input.map((item) =>
      redactSensitiveData(item, maxDepth - 1, seen),
    ) as unknown as T;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (isSensitiveKey(key)) {
      result[key] = REDACTED_CENSOR;
    } else if (typeof value === 'string') {
      if (
        key.toLowerCase().includes('url') ||
        key.toLowerCase().includes('uri')
      ) {
        result[key] = sanitizeUrl(value);
      } else {
        result[key] = redactSensitiveText(value);
      }
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactSensitiveData(value, maxDepth - 1, seen);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * Generates the canonical list of paths to redact in Pino HTTP logger.
 */
export function createPinoRedactPaths(): string[] {
  return [
    // HTTP Request Headers
    'req.headers.cookie',
    'req.headers.authorization',
    'req.headers["x-csrf-token"]',
    'req.headers["x-api-key"]',
    'req.headers["x-auth-token"]',
    'req.headers["x-access-token"]',
    'req.headers["x-refresh-token"]',
    'req.headers["set-cookie"]',

    // HTTP Response Headers
    'res.headers["set-cookie"]',

    // Top-level & nested request body fields
    'req.body.password',
    'req.body.currentPassword',
    'req.body.newPassword',
    'req.body.confirmPassword',
    'req.body.oldPassword',
    'req.body.token',
    'req.body.refreshToken',
    'req.body.accessToken',
    'req.body.secret',
    'req.body.clientSecret',
    'req.body.totpCode',
    'req.body.totpSecret',
    'req.body.twoFactorCode',
    'req.body.twoFactorSecret',
    'req.body.csrfToken',
    'req.body.card',
    'req.body.cardNumber',
    'req.body.creditCard',
    'req.body.cvv',
    'req.body.cvc',
    'req.body.privateKey',
    'req.body.credential',
    'req.body.credentials',

    // Wildcards for deeply nested request body objects
    'req.body.*.password',
    'req.body.*.currentPassword',
    'req.body.*.newPassword',
    'req.body.*.token',
    'req.body.*.refreshToken',
    'req.body.*.accessToken',
    'req.body.*.secret',
    'req.body.*.clientSecret',
    'req.body.*.cvv',
    'req.body.*.cardNumber',

    // Root-level fields if logged directly in logger.info({ ... })
    'password',
    'currentPassword',
    'newPassword',
    'confirmPassword',
    'oldPassword',
    'token',
    'refreshToken',
    'accessToken',
    'secret',
    'clientSecret',
    'totpSecret',
    'totpCode',
    'twoFactorSecret',
    'twoFactorCode',
    'csrfToken',
    'card',
    'cardNumber',
    'creditCard',
    'cvv',
    'cvc',
    'privateKey',
    'credential',
    'credentials',

    // Second-level wildcard fields
    '*.password',
    '*.currentPassword',
    '*.newPassword',
    '*.token',
    '*.refreshToken',
    '*.accessToken',
    '*.secret',
    '*.clientSecret',
    '*.totpSecret',
    '*.cvv',
    '*.cardNumber',
  ];
}

/**
 * Scrubs breadcrumbs before they are sent or stored in Sentry.
 */
export function scrubSentryBreadcrumb<T extends Record<string, any>>(
  breadcrumb: T,
): T {
  if (!breadcrumb || typeof breadcrumb !== 'object') return breadcrumb;
  const clone = { ...breadcrumb } as Record<string, any>;
  if (clone.message && typeof clone.message === 'string') {
    clone.message = redactSensitiveText(clone.message);
  }
  if (clone.data && typeof clone.data === 'object') {
    clone.data = redactSensitiveData(clone.data);
  }
  return clone as T;
}

/**
 * Deeply scrubs Sentry events (request bodies, headers, cookies, URLs,
 * exception messages, stack frame variables, breadcrumbs, and extras)
 * before transmission to Sentry.
 */
export function scrubSentryEvent<T extends Record<string, any>>(event: T): T {
  if (!event || typeof event !== 'object') return event;

  const clone = { ...event } as Record<string, any>;

  // 1. Scrub request data and headers
  if (clone.request && typeof clone.request === 'object') {
    const req = { ...clone.request };
    if (req.data) {
      req.data = redactSensitiveData(req.data);
    }
    if (req.headers && typeof req.headers === 'object') {
      req.headers = redactSensitiveData(req.headers);
    }
    if (req.cookies) {
      req.cookies = REDACTED_CENSOR;
    }
    if (req.url && typeof req.url === 'string') {
      req.url = sanitizeUrl(req.url);
    }
    if (req.query_string && typeof req.query_string === 'string') {
      req.query_string = redactSensitiveText(req.query_string);
    }
    clone.request = req;
  }

  // 2. Scrub exception messages and stack traces
  if (clone.exception?.values && Array.isArray(clone.exception.values)) {
    clone.exception = {
      ...clone.exception,
      values: clone.exception.values.map((val: any) => {
        const valClone = { ...val };
        if (valClone.value && typeof valClone.value === 'string') {
          valClone.value = redactSensitiveText(valClone.value);
        }
        if (
          valClone.stacktrace?.frames &&
          Array.isArray(valClone.stacktrace.frames)
        ) {
          valClone.stacktrace = {
            ...valClone.stacktrace,
            frames: valClone.stacktrace.frames.map((frame: any) => {
              if (frame.vars && typeof frame.vars === 'object') {
                return { ...frame, vars: redactSensitiveData(frame.vars) };
              }
              return frame;
            }),
          };
        }
        return valClone;
      }),
    };
  }

  // 3. Scrub top-level message & extra
  if (clone.message && typeof clone.message === 'string') {
    clone.message = redactSensitiveText(clone.message);
  }
  if (clone.extra && typeof clone.extra === 'object') {
    clone.extra = redactSensitiveData(clone.extra);
  }

  // 4. Scrub breadcrumbs attached to event
  if (clone.breadcrumbs && Array.isArray(clone.breadcrumbs)) {
    clone.breadcrumbs = clone.breadcrumbs.map(scrubSentryBreadcrumb);
  }

  return clone as T;
}
