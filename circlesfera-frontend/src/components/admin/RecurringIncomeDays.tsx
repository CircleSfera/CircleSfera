import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  adminApi,
  type RecurringIncomeDay,
} from '../../services/admin.service';
import { formatCents } from '../../utils/money';

// Enough days to find the one kept thirty days before the newest.
const DAYS_READ = 31;
const DAYS_LISTED = 7;

// A kept day is a date with no time: it is written as that date everywhere.
const formatKeptDay = (day: string, language: string) =>
  new Date(day).toLocaleDateString(language, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  });

function dayBefore(day: string, count: number): string {
  const date = new Date(day);
  date.setUTCDate(date.getUTCDate() - count);
  return date.toISOString().slice(0, 10);
}

/**
 * The recurring monthly income as kept day by day: the newest day against
 * the one kept seven and thirty days before, and the last days.
 */
export function RecurringIncomeDays() {
  const { t, i18n } = useTranslation();
  const { data } = useQuery({
    queryKey: ['admin', 'monetization', 'history'],
    queryFn: () =>
      adminApi.getRecurringIncomeHistory(DAYS_READ).then((res) => res.data),
  });
  if (!data) return null;

  const days = data.days;
  const newest = days[0];
  const kept = (count: number) =>
    newest && days.find((d) => d.day === dayBefore(newest.day, count));
  const oldest = days[days.length - 1];
  const earlier: { label: string; day: RecurringIncomeDay }[] = [];
  for (const count of [7, 30]) {
    const day = kept(count);
    if (day)
      earlier.push({
        label: t('admin.monetization.income_days_before', { count }),
        day,
      });
  }
  // With neither kept yet, the newest day is compared with the first one.
  if (earlier.length === 0 && days.length > 1)
    earlier.push({
      label: t('admin.monetization.income_since', {
        date: formatKeptDay(oldest.day, i18n.language),
      }),
      day: oldest,
    });

  const change = (from: RecurringIncomeDay) => {
    const cents = newest.mrrCents - from.mrrCents;
    if (cents === 0)
      return (
        <span className="text-white/50">
          {t('admin.monetization.income_no_change')}
        </span>
      );
    return (
      <span className={cents > 0 ? 'text-green-400' : 'text-red-400'}>
        {cents > 0 ? '+' : '−'}
        {formatCents(Math.abs(cents), i18n.language)}
      </span>
    );
  };

  return (
    <section className="glass-panel rounded-lg p-2.5 sm:p-3">
      <h3 className="text-sm font-semibold text-white">
        {t('admin.monetization.income_title')}
      </h3>
      <p className="text-white/50 text-xs">
        {t('admin.monetization.income_subtitle')}
      </p>

      {days.length < 2 ? (
        <p className="mt-2 text-sm text-white/70">
          {newest
            ? t('admin.monetization.income_one_day', {
                date: formatKeptDay(newest.day, i18n.language),
              })
            : t('admin.monetization.income_no_days')}
        </p>
      ) : (
        <>
          <ul className="mt-2 divide-y divide-white/5">
            {earlier.map(({ label, day }) => (
              <li
                key={day.day}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="min-w-0 text-sm text-white/70 truncate">
                  {label}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-white">
                  {formatCents(day.mrrCents, i18n.language)}{' '}
                  <span className="font-medium">{change(day)}</span>
                </span>
              </li>
            ))}
          </ul>
          <h4 className="mt-3 text-xs font-semibold text-white/50">
            {t('admin.monetization.income_last_days')}
          </h4>
          <ul className="divide-y divide-white/5">
            {days.slice(0, DAYS_LISTED).map((day) => (
              <li
                key={day.day}
                className="flex items-center justify-between gap-3 py-2 last:pb-0"
              >
                <span className="min-w-0 text-sm text-white/70 truncate">
                  {formatKeptDay(day.day, i18n.language)}
                </span>
                <span className="shrink-0 text-sm tabular-nums text-white">
                  <span className="font-semibold">
                    {formatCents(day.mrrCents, i18n.language)}
                  </span>{' '}
                  <span className="text-xs text-white/50">
                    {t('admin.monetization.income_subscriptions', {
                      count: day.activeSubscriptions,
                    })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
