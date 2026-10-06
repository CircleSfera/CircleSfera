import type { Locale } from '@prisma/client';

// Languages the app and the server texts (emails, notices) are available in.
export const SUPPORTED_LOCALES = [
  'en',
  'es',
] as const satisfies readonly Locale[];

// Accounts with no known language get Spanish, the language the server texts
// were written in before accounts had one.
export const DEFAULT_LOCALE: Locale = 'es';

// Maps any language tag (en-GB, es-419, ES) to a supported locale.
export function toSupportedLocale(tag: string | null | undefined): Locale {
  const base = tag?.trim().toLowerCase().split(/[-_]/)[0];
  return (SUPPORTED_LOCALES as readonly string[]).includes(base ?? '')
    ? (base as Locale)
    : DEFAULT_LOCALE;
}
