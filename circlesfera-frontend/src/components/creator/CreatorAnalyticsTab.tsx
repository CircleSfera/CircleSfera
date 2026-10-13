import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type {
  CreatorChartDay,
  CreatorStats,
} from '../../services/creator.service';
import { creatorApi } from '../../services/creator.service';
import { monetizationApi } from '../../services/monetization.service';
import { useAuthStore } from '../../stores/authStore';
import { exportToCSV } from '../../utils/exportUtils';
import { formatNumber } from '../../utils/format';
import { formatCents } from '../../utils/money';
import { hasElitePlan } from '../../utils/plans';
import { Button, Card } from '../ui';
import { CreatorAnalyticsDashboard } from './CreatorAnalyticsDashboard';
import CreatorEmpty from './CreatorEmpty';
import {
  CreatorFigure,
  CreatorFigures,
  CreatorRow,
  CreatorSection,
} from './CreatorPieces';
import CreatorTrendChart from './CreatorTrendChart';
import { chartDay, chartMonth } from './creatorWords';

// The places with most followers; the rest would be a long tail of ones.
const TOP_PLACES = 6;

export default function CreatorAnalyticsTab() {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const verificationLevel = useAuthStore(
    (state) => state.profile?.verificationLevel,
  );

  const { data: chartData, isLoading: isChartLoading } = useQuery<
    CreatorChartDay[]
  >({
    queryKey: ['creator', 'activity-chart'],
    queryFn: () => creatorApi.getActivityChart().then((r) => r.data),
  });

  const { data: stats, isLoading: isStatsLoading } = useQuery<CreatorStats>({
    queryKey: ['creator', 'stats'],
    queryFn: () => creatorApi.getStats().then((r) => r.data),
  });

  const { data: incomeStats, isLoading: isIncomeLoading } = useQuery({
    queryKey: ['creator', 'income-stats'],
    queryFn: () => monetizationApi.getIncomeStats(),
  });

  const { data: financialSummary, isLoading: isFinancialLoading } = useQuery({
    queryKey: ['creator', 'financial-summary'],
    queryFn: () => monetizationApi.getFinancialSummary(),
  });

  if (
    isChartLoading ||
    isStatsLoading ||
    isIncomeLoading ||
    isFinancialLoading
  ) {
    return (
      <div className="space-y-3" data-testid="analytics-loading">
        <div className="h-8 w-48 rounded-md bg-white/5 animate-pulse" />
        <div className="h-52 rounded-xl bg-white/5 animate-pulse border border-white/5" />
      </div>
    );
  }

  const days = chartData ?? [];
  const followers = stats?.followerCount ?? 0;
  // Followers with no place given are one group, named in words.
  const places = [...(stats?.geoDistribution ?? [])]
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_PLACES);

  return (
    <div className="space-y-8 pb-8">
      <CreatorSection
        title={t('creator.analytics.audience_evolution')}
        action={
          days.length > 0 ? (
            <Button
              variant="ghost"
              size="compact"
              className="min-h-11 gap-2 shrink-0"
              onClick={() => exportToCSV('analytics_report.csv', days)}
            >
              <Download size={14} aria-hidden />
              {t('creator.analytics.export_csv')}
            </Button>
          ) : undefined
        }
      >
        <CreatorTrendChart
          data={days}
          xKey="date"
          series={[
            {
              key: 'views',
              name: t('creator.analytics.views'),
              color: 'var(--color-brand-primary)',
            },
            {
              key: 'followers',
              name: t('creator.analytics.followers'),
              color: 'var(--color-brand-accent)',
            },
          ]}
          formatX={(value, long) => chartDay(value, long, language)}
          fewText={t('creator.analytics.not_enough_data')}
        />
      </CreatorSection>

      <CreatorSection title={t('creator.analytics.follower_locations')}>
        {places.length === 0 ? (
          <CreatorEmpty title={t('creator.analytics.no_location_data')} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {places.map((place) => (
              <CreatorRow
                key={place.location}
                title={
                  place.location === 'Unknown'
                    ? t('creator.analytics.no_place')
                    : place.location
                }
                facts={[
                  t('creator.analytics.place_followers', {
                    count: place.count,
                    formatted: formatNumber(place.count, language),
                  }),
                ]}
                badge={
                  <span className="shrink-0 text-sm font-medium text-white tabular-nums">
                    {followers > 0
                      ? `${Math.round((place.count / followers) * 100)} %`
                      : ''}
                  </span>
                }
              />
            ))}
          </div>
        )}
      </CreatorSection>

      <CreatorSection
        title={t('creator.analytics.income')}
        hint={t('creator.analytics.income_history')}
      >
        <div className="space-y-3">
          <CreatorFigures>
            <CreatorFigure
              label={t('creator.analytics.current_month_income')}
              value={formatCents(
                financialSummary?.currentMonthIncome || 0,
                language,
              )}
            />
            <CreatorFigure
              label={t('creator.analytics.total_tips')}
              value={formatCents(financialSummary?.totalTips || 0, language)}
            />
          </CreatorFigures>
          <CreatorTrendChart
            data={incomeStats ?? []}
            xKey="month"
            series={[
              {
                key: 'income',
                name: t('creator.analytics.income_series'),
                color: 'var(--color-brand-primary)',
              },
            ]}
            formatX={(value, long) => chartMonth(value, long, language)}
            formatY={(value) => formatCents(value, language)}
            fewText={t('creator.analytics.no_income_data')}
          />
        </div>
      </CreatorSection>

      {/* Advanced analytics come with the Elite Creator and Business plans */}
      {hasElitePlan(verificationLevel) ? (
        <CreatorAnalyticsDashboard />
      ) : (
        <CreatorSection title={t('creator.advanced.title')}>
          <Card
            variant="glass"
            className="p-4 flex flex-col sm:flex-row sm:items-center gap-3"
          >
            <p className="flex-1 text-sm text-white/60 leading-relaxed">
              {t('creator.advanced.plan_desc')}
            </p>
            <Link
              to="/pricing"
              className="inline-flex items-center justify-center min-h-11 px-6 rounded-xl border border-brand-primary/30 text-sm font-bold text-white btn-gradient-brand shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"
            >
              {t('creator.advanced.plan_cta')}
            </Link>
          </Card>
        </CreatorSection>
      )}
    </div>
  );
}
