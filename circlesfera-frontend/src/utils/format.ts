// Dates and numbers in the app language, never the browser's. Components
// pass `i18n.language` from useTranslation so the text follows a language
// change.
type DateInput = string | number | Date;

export function formatDate(
  value: DateInput,
  language: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Date(value).toLocaleDateString(language, options);
}

export function formatDateTime(value: DateInput, language: string): string {
  return new Date(value).toLocaleString(language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatTime(value: DateInput, language: string): string {
  return new Date(value).toLocaleTimeString(language, { timeStyle: 'short' });
}

// Undefined in, undefined out, so `formatNumber(stats?.count) || '0'` keeps
// working for data still loading.
export function formatNumber(value: number, language: string): string;
export function formatNumber(
  value: number | null | undefined,
  language: string,
): string | undefined;
export function formatNumber(
  value: number | null | undefined,
  language: string,
): string | undefined {
  return value == null ? undefined : value.toLocaleString(language);
}
