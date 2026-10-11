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

// A day as the staff screens write it: "11 oct 2026". The same day part as
// formatDateTime, so a list and a log read alike.
export function formatDay(value: DateInput, language: string): string {
  return new Date(value).toLocaleDateString(language, { dateStyle: 'medium' });
}

// How long something has been waiting, for a queue: "5 min ago" up to a
// week, the day after that.
export function formatWaiting(
  value: DateInput,
  language: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const minutes = Math.floor(
    Math.max(0, Date.now() - new Date(value).getTime()) / 60_000,
  );
  if (minutes < 1) return t('admin.shared.time_ago_now');
  if (minutes < 60)
    return t('admin.shared.time_ago_minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('admin.shared.time_ago_hours', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('admin.shared.time_ago_days', { count: days });
  return formatDay(value, language);
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
