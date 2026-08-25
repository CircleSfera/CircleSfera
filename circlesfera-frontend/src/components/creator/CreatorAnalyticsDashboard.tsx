import {
  AlertCircle,
  Award,
  Clock,
  DollarSign,
  Download,
  Eye,
  Heart,
  Loader2,
  MessageCircle,
  Sparkles,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { creatorApi } from '../../services/creator.service';
import { logger } from '../../utils/logger';
import { Button, Card } from '../ui';

interface RevenueData {
  period: string;
  grossRevenue: number;
  subscriptionsTotal: number;
  tipsTotal: number;
  postUnlocksTotal: number;
  giftsTotal: number;
  activeSubscribersCount: number;
  totalFollowersCount: number;
  conversionRate: number;
  currency: string;
}

interface RetentionData {
  avgDwellSeconds: number;
  totalInteractionsSampled: number;
  peakActivityHourUTC: number;
  hourlyDistribution: number[];
}

interface TopPost {
  id: string;
  caption: string | null;
  views: number;
  performanceScore: number;
  likes: number;
  comments: number;
  bookmarks: number;
  thumbnailUrl: string | null;
  createdAt: string;
}

const PERIODS = ['7d', '30d', '90d', '1y'] as const;

export const CreatorAnalyticsDashboard = () => {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('30d');
  const [loading, setLoading] = useState(true);
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [retention, setRetention] = useState<RetentionData | null>(null);
  const [topPosts, setTopPosts] = useState<TopPost[]>([]);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
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
      setError(
        t('creator.advanced.error', 'Could not load advanced analytics.'),
      );
    } finally {
      setLoading(false);
    }
  }, [period, t]);

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

  const share = (part: number) =>
    revenue?.grossRevenue ? (part / revenue.grossRevenue) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white tracking-tight">
            {t('creator.advanced.title', 'Revenue and retention')}
          </h2>
          <p className="text-sm text-white/50 mt-0.5">
            {t(
              'creator.advanced.subtitle',
              'Paid audience, income mix and when people stay.',
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div
            role="tablist"
            className="flex p-1 rounded-xl border border-white/10 bg-surface-elevated"
          >
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={period === p}
                onClick={() => setPeriod(p)}
                className={`px-3 min-h-11 text-sm rounded-lg transition-colors ${
                  period === p
                    ? 'bg-brand-primary/15 text-white font-medium'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="md"
            onClick={handleExportCsv}
            disabled={downloadingCsv || loading}
            className="min-h-11 gap-2"
          >
            {downloadingCsv ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">
              {t('creator.advanced.export_csv', 'Export CSV')}
            </span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-brand-secondary/20 bg-brand-secondary/10 text-sm text-brand-secondary">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-12 text-white/50">
          <Loader2 className="w-5 h-5 animate-spin mr-3 text-brand-primary" />
          <span className="text-sm">
            {t('creator.advanced.loading', 'Loading creator metrics…')}
          </span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi
              icon={DollarSign}
              label={t('creator.advanced.gross', 'Gross revenue')}
              value={`€${(revenue?.grossRevenue || 0).toFixed(2)}`}
              hint={t('creator.advanced.period_hint', 'Period: {{period}}', {
                period,
              })}
            />
            <Kpi
              icon={Users}
              label={t('creator.advanced.paid_subs', 'Paid subscribers')}
              value={String(revenue?.activeSubscribersCount || 0)}
              hint={t('creator.advanced.conversion', 'Conversion: {{rate}}%', {
                rate: revenue?.conversionRate || 0,
              })}
            />
            <Kpi
              icon={Clock}
              label={t('creator.advanced.dwell', 'Average dwell')}
              value={`${retention?.avgDwellSeconds || 0}s`}
              hint={t('creator.advanced.peak', 'Peak: {{hour}}:00 UTC', {
                hour: retention?.peakActivityHourUTC ?? '—',
              })}
            />
            <Kpi
              icon={Sparkles}
              label={t('creator.advanced.tips_gifts', 'Tips & gifts')}
              value={`€${((revenue?.tipsTotal || 0) + (revenue?.giftsTotal || 0)).toFixed(2)}`}
              hint={t('creator.advanced.tips_hint', 'Live and direct messages')}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card variant="glass" className="p-4 space-y-4">
              <h3 className="text-sm font-medium text-white">
                {t('creator.advanced.breakdown', 'Income sources')}
              </h3>
              <ShareRow
                label={t('creator.advanced.subscriptions', 'Subscriptions')}
                amount={revenue?.subscriptionsTotal || 0}
                pct={share(revenue?.subscriptionsTotal || 0)}
              />
              <ShareRow
                label={t('creator.advanced.unlocks', 'Paid unlocks')}
                amount={revenue?.postUnlocksTotal || 0}
                pct={share(revenue?.postUnlocksTotal || 0)}
              />
              <ShareRow
                label={t('creator.advanced.tips_gifts', 'Tips & gifts')}
                amount={(revenue?.tipsTotal || 0) + (revenue?.giftsTotal || 0)}
                pct={share(
                  (revenue?.tipsTotal || 0) + (revenue?.giftsTotal || 0),
                )}
              />
            </Card>

            <Card variant="glass" className="p-4 space-y-4">
              <h3 className="text-sm font-medium text-white">
                {t('creator.advanced.hourly', 'Hourly interaction (UTC)')}
              </h3>
              <div className="grid grid-cols-12 gap-1 pt-1">
                {Array.from({ length: 24 }, (_, hour) => ({
                  hour,
                  count: retention?.hourlyDistribution[hour] || 0,
                })).map((slot) => {
                  const max = Math.max(
                    ...(retention?.hourlyDistribution || [1]),
                    1,
                  );
                  const intensity = Math.min(
                    Math.round((slot.count / max) * 100),
                    100,
                  );
                  return (
                    <div
                      key={`hour-slot-${slot.hour}`}
                      title={t('creator.advanced.hour_slot', {
                        hour: slot.hour,
                        count: slot.count,
                        defaultValue:
                          '{{hour}}:00 UTC — {{count}} interactions',
                      })}
                      className="h-10 rounded-md flex flex-col justify-end p-1"
                      style={{
                        backgroundColor: `rgba(var(--brand-primary-rgb), ${Math.max(intensity / 100, 0.08)})`,
                      }}
                    >
                      <span className="text-[9px] text-white/70 text-center">
                        {slot.hour}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-white/50">
                {t(
                  'creator.advanced.hourly_hint',
                  'Publishing around {{hour}}:00 UTC usually matches peak dwell.',
                  { hour: retention?.peakActivityHourUTC ?? '—' },
                )}
              </p>
            </Card>
          </div>

          <Card variant="glass" className="p-4 space-y-3">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
              <Award size={16} className="text-brand-primary" aria-hidden />
              {t('creator.advanced.top_posts', 'Highest-performing posts')}
            </h3>
            {topPosts.length === 0 ? (
              <p className="text-sm text-white/50 py-2">
                {t(
                  'creator.advanced.no_top_posts',
                  'No posts with scored metrics yet.',
                )}
              </p>
            ) : (
              <div className="space-y-2">
                {topPosts.map((post, idx) => (
                  <div
                    key={post.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border border-white/5 bg-white/3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-8 h-8 rounded-lg bg-brand-primary/15 text-brand-primary text-xs font-medium flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">
                          {post.caption ||
                            t(
                              'creator.dashboard.untitled_post',
                              'Untitled post',
                            )}
                        </p>
                        <div className="flex items-center gap-3 text-[11px] text-white/40 mt-0.5">
                          <span className="inline-flex items-center gap-1">
                            <Eye size={12} aria-hidden />
                            {post.views}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Heart size={12} aria-hidden />
                            {post.likes}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MessageCircle size={12} aria-hidden />
                            {post.comments}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-white/70 tabular-nums shrink-0">
                      {post.performanceScore.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card variant="glass" className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-white/50">{label}</span>
        <Icon size={16} className="text-brand-primary" aria-hidden />
      </div>
      <p className="text-2xl font-semibold text-white tabular-nums">{value}</p>
      <p className="text-[11px] text-white/40 mt-1">{hint}</p>
    </Card>
  );
}

function ShareRow({
  label,
  amount,
  pct,
}: {
  label: string;
  amount: number;
  pct: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-white/60">{label}</span>
        <span className="text-white tabular-nums">€{amount.toFixed(2)}</span>
      </div>
      <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand-primary rounded-full"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}
