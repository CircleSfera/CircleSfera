import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type BusinessStatTotals,
  businessStatsApi,
} from '../../services/businessStats.service';
import { formatNumber } from '../../utils/format';
import { Card } from '../ui';
import CreatorEmpty from './CreatorEmpty';
import { CreatorRow, CreatorSection } from './CreatorPieces';
import CreatorTrendChart from './CreatorTrendChart';
import { chartDay } from './creatorWords';

// The stretches a business can look at, in days.
export const BUSINESS_RANGES = [7, 28, 90] as const;
const DEFAULT_RANGE = 28;
// How many of the best hours are listed.
const BEST_HOURS = 3;

const TOTALS: { key: keyof BusinessStatTotals; label: string }[] = [
  { key: 'visits', label: 'visits' },
  { key: 'callTaps', label: 'calls' },
  { key: 'emailTaps', label: 'emails' },
  { key: 'addressTaps', label: 'addresses' },
  { key: 'websiteTaps', label: 'websites' },
];

/** The name of a country in the person's language, or its code. */
function countryName(code: string, language: string): string {
  try {
    return (
      new Intl.DisplayNames([language], { type: 'region' }).of(code) ?? code
    );
  } catch {
    return code;
  }
}

/**
 * The hours of the day, in the person's own time, when the Profile's posts
 * were viewed most. The server counts them by UTC hour.
 */
export function bestLocalHours(
  viewsByHour: number[],
  offsetMinutes: number,
  count = BEST_HOURS,
): { hour: number; views: number }[] {
  const shift = Math.round(-offsetMinutes / 60);
  return viewsByHour
    .map((views, utcHour) => ({
      hour: (((utcHour + shift) % 24) + 24) % 24,
      views,
    }))
    .filter((h) => h.views > 0)
    .sort((a, b) => b.views - a.views || a.hour - b.hour)
    .slice(0, count);
}

const hourText = (hour: number) =>
  `${String(hour).padStart(2, '0')}:00–${String((hour + 1) % 24).padStart(2, '0')}:00`;

/**
 * The statistics of a Business Profile: visits to it and taps on its
 * buttons, where its visitors are, and when its posts are seen most.
 */
export default function CreatorBusinessTab() {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const [days, setDays] = useState<number>(DEFAULT_RANGE);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['business-stats', days],
    queryFn: () => businessStatsApi.read(days),
  });

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="business-loading">
        <div className="h-8 w-48 rounded-md bg-white/5 animate-pulse" />
        <div className="h-52 rounded-xl bg-white/5 animate-pulse border border-white/5" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <CreatorEmpty
        title={t('creator.business.error')}
        action={{
          label: t('creator.business.retry'),
          onClick: () => void refetch(),
        }}
      />
    );
  }

  const daily = data.daily.map((d) => ({
    ...d,
    taps: d.callTaps + d.emailTaps + d.addressTaps + d.websiteTaps,
  }));
  const hours = bestLocalHours(
    data.viewsByHour,
    new Date().getTimezoneOffset(),
  );

  return (
    <div className="space-y-8 pb-8">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">{t('creator.business.range')}</legend>
        {BUSINESS_RANGES.map((range) => (
          <button
            key={range}
            type="button"
            aria-pressed={days === range}
            onClick={() => setDays(range)}
            className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${
              days === range
                ? 'bg-white text-black'
                : 'border border-white/10 bg-white/5 text-white hover:bg-white/10'
            }`}
          >
            {t('creator.business.last_days', { count: range })}
          </button>
        ))}
      </fieldset>

      <CreatorSection
        title={t('creator.business.title')}
        hint={t('creator.business.hint')}
      >
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {TOTALS.map(({ key, label }) => (
            <Card
              key={key}
              variant="glass"
              className="p-4"
              data-testid={`business-total-${label}`}
            >
              <p className="text-2xl font-semibold text-white tabular-nums">
                {formatNumber(data.totals[key], language)}
              </p>
              <p className="text-xs text-white/60">
                {t(`creator.business.totals.${label}`)}
              </p>
            </Card>
          ))}
        </div>
      </CreatorSection>

      <CreatorSection title={t('creator.business.by_day')}>
        <CreatorTrendChart
          data={daily}
          xKey="day"
          series={[
            {
              key: 'visits',
              name: t('creator.business.totals.visits'),
              color: 'var(--color-brand-primary)',
            },
            {
              key: 'taps',
              name: t('creator.business.taps'),
              color: 'var(--color-brand-accent)',
            },
          ]}
          formatX={(value, long) => chartDay(value, long, language)}
          fewText={t('creator.analytics.not_enough_data')}
        />
      </CreatorSection>

      <CreatorSection
        title={t('creator.business.countries')}
        hint={t('creator.business.countries_hint')}
      >
        {data.countries.length === 0 ? (
          <CreatorEmpty title={t('creator.business.no_visits')} />
        ) : (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {data.countries.map((c) => (
              <CreatorRow
                key={c.country || 'unknown'}
                title={
                  c.country
                    ? countryName(c.country, language)
                    : t('creator.business.unknown_country')
                }
                badge={
                  <span className="shrink-0 text-sm font-medium text-white tabular-nums">
                    {t('creator.business.visits_count', {
                      count: c.visits,
                      formatted: formatNumber(c.visits, language),
                    })}
                  </span>
                }
              />
            ))}
            {data.otherCountriesVisits > 0 && (
              <CreatorRow
                title={t('creator.business.other_countries')}
                badge={
                  <span className="shrink-0 text-sm font-medium text-white tabular-nums">
                    {t('creator.business.visits_count', {
                      count: data.otherCountriesVisits,
                      formatted: formatNumber(
                        data.otherCountriesVisits,
                        language,
                      ),
                    })}
                  </span>
                }
              />
            )}
          </div>
        )}
      </CreatorSection>

      <CreatorSection
        title={t('creator.business.best_hours')}
        hint={t('creator.business.best_hours_hint')}
      >
        {hours.length === 0 ? (
          <CreatorEmpty title={t('creator.business.no_views')} />
        ) : (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
            {hours.map((h) => (
              <CreatorRow
                key={h.hour}
                title={hourText(h.hour)}
                badge={
                  <span className="shrink-0 text-sm font-medium text-white tabular-nums">
                    {t('creator.business.views_count', {
                      count: h.views,
                      formatted: formatNumber(h.views, language),
                    })}
                  </span>
                }
              />
            ))}
          </div>
        )}
      </CreatorSection>
    </div>
  );
}
