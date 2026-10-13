import { Download, Image as ImageIcon, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { creatorApi } from '../../services/creator.service';
import { formatNumber } from '../../utils/format';
import { logger } from '../../utils/logger';
import { formatCents } from '../../utils/money';
import { Button, Card } from '../ui';
import CreatorEmpty from './CreatorEmpty';
import {
  CreatorFigure,
  CreatorFigures,
  CreatorRow,
  CreatorSection,
  CreatorViewChoice,
} from './CreatorPieces';

interface RevenueData {
  grossRevenue: number;
  subscriptionsTotal: number;
  tipsTotal: number;
  postUnlocksTotal: number;
  giftsTotal: number;
}

interface RetentionData {
  totalInteractionsSampled: number;
  hourlyDistribution: number[];
}

interface TopPost {
  id: string;
  caption: string | null;
  views: number;
  likes: number;
  comments: number;
  bookmarks: number;
  thumbnailUrl: string | null;
}

const PERIODS = ['7d', '30d', '90d', '1y'] as const;
type Period = (typeof PERIODS)[number];

// The hours of the axis that carry their name; the rest are read from them.
const NAMED_HOURS = [0, 6, 12, 18];

// The server counts by hour of universal time; the reader sees their own day.
function byLocalHour(utcCounts: number[]): number[] {
  const local = new Array<number>(24).fill(0);
  utcCounts.forEach((count, utcHour) => {
    const moment = new Date();
    moment.setUTCHours(utcHour, 0, 0, 0);
    local[moment.getHours()] += count;
  });
  return local;
}

// What the Elite Creator and Business plans add to Analytics: the income of a
// period by kind, the hours the posts are looked at, and the best posts.
export const CreatorAnalyticsDashboard = () => {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const [period, setPeriod] = useState<Period>('30d');
  const [loading, setLoading] = useState(true);
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const [error, setError] = useState(false);

  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [retention, setRetention] = useState<RetentionData | null>(null);
  const [topPosts, setTopPosts] = useState<TopPost[]>([]);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const [revRes, retRes, topRes] = await Promise.all([
        creatorApi.getRevenueAnalytics(period),
        creatorApi.getAudienceRetentionAnalytics(),
        creatorApi.getTopPerformingContent(5),
      ]);
      setRevenue(revRes.data);
      setRetention(retRes.data);
      setTopPosts(topRes.data);
    } catch (err) {
      logger.error('Failed to fetch creator analytics:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleExportCsv = async () => {
    try {
      setDownloadingCsv(true);
      const res = await creatorApi.exportAnalyticsCsv(period);
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `circlesfera-creator-report-${period}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      logger.error('Failed to export analytics CSV:', err);
    } finally {
      setDownloadingCsv(false);
    }
  };

  // These amounts arrive in euros; every amount is written from cents.
  const amount = (euros: number | undefined) =>
    formatCents(Math.round((euros ?? 0) * 100), language);
  const count = (key: string, value: number) =>
    t(key, { count: value, formatted: formatNumber(value, language) });

  const hours = byLocalHour(retention?.hourlyDistribution ?? []);
  const sampled = retention?.totalInteractionsSampled ?? 0;
  const busiest = Math.max(...hours, 1);
  const peakHour = hours.indexOf(Math.max(...hours));
  const nameOfHour = (hour: number) => {
    const moment = new Date();
    moment.setHours(hour, 0, 0, 0);
    return moment.toLocaleTimeString(language, {
      hour: 'numeric',
      minute: '2-digit',
    });
  };
  const subscriptions = revenue?.subscriptionsTotal ?? 0;

  return (
    <div className="space-y-8">
      <CreatorSection
        title={t('creator.advanced.income_title')}
        action={
          <Button
            variant="ghost"
            size="compact"
            className="min-h-11 gap-2 shrink-0"
            onClick={handleExportCsv}
            disabled={downloadingCsv || loading}
          >
            {downloadingCsv ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <Download size={14} aria-hidden />
            )}
            {t('creator.advanced.export_csv')}
          </Button>
        }
      >
        <div className="space-y-3">
          <CreatorViewChoice
            label={t('creator.advanced.period_label')}
            items={PERIODS.map((value) => ({
              value,
              label: t(`creator.advanced.period.${value}`),
            }))}
            value={period}
            onChange={setPeriod}
          />
          {error ? (
            <CreatorEmpty
              title={t('creator.advanced.error')}
              action={{
                label: t('creator.advanced.retry'),
                onClick: fetchAnalytics,
              }}
            />
          ) : loading ? (
            <div
              className="h-24 rounded-xl bg-white/5 animate-pulse border border-white/5"
              data-testid="advanced-loading"
            />
          ) : (
            <CreatorFigures five={subscriptions > 0}>
              <CreatorFigure
                label={t('creator.advanced.gross')}
                value={amount(revenue?.grossRevenue)}
                hint={t('creator.advanced.gross_hint')}
              />
              <CreatorFigure
                label={t('creator.advanced.tips')}
                value={amount(revenue?.tipsTotal)}
              />
              <CreatorFigure
                label={t('creator.advanced.unlocks')}
                value={amount(revenue?.postUnlocksTotal)}
              />
              <CreatorFigure
                label={t('creator.advanced.gifts')}
                value={amount(revenue?.giftsTotal)}
              />
              {subscriptions > 0 ? (
                <CreatorFigure
                  label={t('creator.advanced.subscriptions')}
                  value={amount(subscriptions)}
                />
              ) : null}
            </CreatorFigures>
          )}
        </div>
      </CreatorSection>

      {error || loading ? null : (
        <>
          <CreatorSection
            title={t('creator.advanced.hours_title')}
            hint={
              sampled > 0
                ? t('creator.advanced.hours_hint', {
                    count: sampled,
                    formatted: formatNumber(sampled, language),
                    hour: nameOfHour(peakHour),
                  })
                : undefined
            }
          >
            {sampled === 0 ? (
              <CreatorEmpty title={t('creator.advanced.no_hours')} />
            ) : (
              <Card variant="glass" className="p-4">
                <div
                  role="img"
                  aria-label={t('creator.advanced.hours_peak', {
                    hour: nameOfHour(peakHour),
                  })}
                >
                  <div className="flex items-end gap-0.5 h-24">
                    {hours.map((value, hour) => (
                      <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: the index is the hour of the day
                        key={hour}
                        className="flex-1 rounded-sm bg-brand-primary"
                        style={{
                          height: `${Math.max((value / busiest) * 100, 3)}%`,
                          opacity: value > 0 ? 1 : 0.2,
                        }}
                      />
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-4 text-xs text-white/50 tabular-nums">
                    {NAMED_HOURS.map((hour) => (
                      <span key={hour}>{nameOfHour(hour)}</span>
                    ))}
                  </div>
                </div>
              </Card>
            )}
          </CreatorSection>

          <CreatorSection
            title={t('creator.advanced.top_posts')}
            hint={
              topPosts.length > 0 ? t('creator.advanced.top_hint') : undefined
            }
          >
            {topPosts.length === 0 ? (
              <CreatorEmpty title={t('creator.advanced.no_top_posts')} />
            ) : (
              <div className="space-y-2">
                {topPosts.map((post) => (
                  <CreatorRow
                    key={post.id}
                    media={
                      post.thumbnailUrl ? (
                        <img
                          src={post.thumbnailUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon size={18} aria-hidden />
                      )
                    }
                    title={post.caption || t('creator.post.untitled')}
                    facts={[
                      [
                        count('creator.post.views', post.views),
                        count('creator.post.likes', post.likes),
                        count('creator.post.comments', post.comments),
                      ].join(' · '),
                      count('creator.advanced.saves', post.bookmarks),
                    ]}
                  />
                ))}
              </div>
            )}
          </CreatorSection>
        </>
      )}
    </div>
  );
};
