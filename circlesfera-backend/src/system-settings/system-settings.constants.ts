// Canonical ops toggles for `system_settings` (admin Configuración global).
export const SYSTEM_SETTING_KEYS = {
  MAINTENANCE_MODE: 'maintenance_mode',
  REGISTRATION_OPEN: 'registration_open',
  CONTENT_POSTING_ENABLED: 'content_posting_enabled',
  LIVE_STREAMS_ENABLED: 'live_streams_enabled',
  TURNSTILE_REQUIRED: 'turnstile_required',
  EMAIL_VERIFICATION_REQUIRED: 'email_verification_required',
  PAYMENTS_ENABLED: 'payments_enabled',
  PROMOTIONS_ON_SALE: 'promotions_on_sale',
  MAX_CONCURRENT_LIVES: 'max_concurrent_lives',
  MAX_CONCURRENT_RECORDINGS: 'max_concurrent_recordings',
} as const;

export type SystemSettingKey =
  (typeof SYSTEM_SETTING_KEYS)[keyof typeof SYSTEM_SETTING_KEYS];

/** The whole numbers a setting that is a count may hold. */
export interface SystemSettingRange {
  min: number;
  max: number;
}

export interface SystemSettingDefault {
  key: SystemSettingKey;
  value: string;
  description: string;
  // A count: a whole number within these bounds. Without it, a switch:
  // 'true' or 'false'.
  range?: SystemSettingRange;
}

export const SYSTEM_SETTING_DEFAULTS: readonly SystemSettingDefault[] = [
  {
    key: SYSTEM_SETTING_KEYS.MAINTENANCE_MODE,
    value: 'false',
    description:
      'When enabled, the consumer API returns 503 except health, CSRF, webhooks and Admin Panel routes.',
  },
  {
    key: SYSTEM_SETTING_KEYS.REGISTRATION_OPEN,
    value: 'true',
    description: 'Allow new user registration on the platform.',
  },
  {
    key: SYSTEM_SETTING_KEYS.CONTENT_POSTING_ENABLED,
    value: 'true',
    description: 'Allow creating posts and stories.',
  },
  {
    key: SYSTEM_SETTING_KEYS.LIVE_STREAMS_ENABLED,
    value: 'true',
    description: 'Allow starting live streams.',
  },
  {
    key: SYSTEM_SETTING_KEYS.TURNSTILE_REQUIRED,
    value: 'true',
    description:
      'Require a Cloudflare Turnstile token on register and login. Skipped when the secret is unset outside production.',
  },
  {
    key: SYSTEM_SETTING_KEYS.EMAIL_VERIFICATION_REQUIRED,
    value: 'true',
    description:
      'Require a verified email before posts, follows, messages, likes, uploads and profile edits.',
  },
  {
    key: SYSTEM_SETTING_KEYS.PAYMENTS_ENABLED,
    value: 'true',
    description:
      'Allow new payments: plans and promotions. While off nothing new is charged.',
  },
  {
    // On: promotions are sold. Staff turn it off from the global settings
    // to stop new sales at once.
    key: SYSTEM_SETTING_KEYS.PROMOTIONS_ON_SALE,
    value: 'true',
    description:
      'Sell new promotions. While off nobody can buy one; promotions already bought keep running.',
  },
  {
    // PD-092: lives run on CircleSfera's own live server, which takes so
    // many at once. Set from measured load (ADR-0024).
    key: SYSTEM_SETTING_KEYS.MAX_CONCURRENT_LIVES,
    value: '10',
    description:
      'Most lives on air at once. A host who would pass it is told lives are full and does not go live.',
    range: { min: 1, max: 500 },
  },
  {
    // PD-092: each recording is encoded by the recorder on the same server.
    key: SYSTEM_SETTING_KEYS.MAX_CONCURRENT_RECORDINGS,
    value: '2',
    description:
      'Most lives recorded at once. A live past it goes on unrecorded, and its host is told before going live.',
    range: { min: 1, max: 50 },
  },
] as const;

const WHOLE_NUMBER = /^\d{1,9}$/;

/**
 * Whether a value fits the setting: a whole number within its range for a
 * count, 'true' or 'false' for a switch (and for a key outside the catalog).
 */
export function isValidSettingValue(key: string, value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const range = SYSTEM_SETTING_DEFAULTS.find((s) => s.key === key)?.range;
  if (!range) return value === 'true' || value === 'false';
  if (!WHOLE_NUMBER.test(value)) return false;
  const n = Number(value);
  return n >= range.min && n <= range.max;
}

export const SYSTEM_SETTING_CACHE_TTL_MS = 30_000;
