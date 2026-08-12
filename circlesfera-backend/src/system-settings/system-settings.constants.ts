/** Canonical ops toggles for `system_settings` (admin Configuración global). */
export const SYSTEM_SETTING_KEYS = {
  MAINTENANCE_MODE: 'maintenance_mode',
  REGISTRATION_OPEN: 'registration_open',
  REQUIRE_INVITE_CODE: 'require_invite_code',
  CONTENT_POSTING_ENABLED: 'content_posting_enabled',
  LIVE_STREAMS_ENABLED: 'live_streams_enabled',
} as const;

export type SystemSettingKey =
  (typeof SYSTEM_SETTING_KEYS)[keyof typeof SYSTEM_SETTING_KEYS];

export interface SystemSettingDefault {
  key: SystemSettingKey;
  value: 'true' | 'false';
  description: string;
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
    key: SYSTEM_SETTING_KEYS.REQUIRE_INVITE_CODE,
    value: 'false',
    description: 'Require a valid invite code to register.',
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
] as const;

export const SYSTEM_SETTING_CACHE_TTL_MS = 30_000;
