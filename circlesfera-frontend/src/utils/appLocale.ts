// Languages the account can have on the server (emails, notices).
export type AppLocale = 'en' | 'es';

// The language the app is actually shown in: Spanish for any Spanish tag,
// English otherwise (the app's fallback language).
export function toAppLocale(language: string | undefined | null): AppLocale {
  return language?.toLowerCase().startsWith('es') ? 'es' : 'en';
}
