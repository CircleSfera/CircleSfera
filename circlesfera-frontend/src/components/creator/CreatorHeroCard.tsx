import { Award, DollarSign, TrendingUp, Users, Zap } from 'lucide-react';
import type { ElementType } from 'react';
import { useTranslation } from 'react-i18next';
import { Area, AreaChart } from 'recharts';
import type {
  CreatorChartDay,
  CreatorStats,
} from '../../services/creator.service';
import SafeResponsiveContainer from '../common/SafeResponsiveContainer';
import { Card } from '../ui';

export interface CreatorPost {
  id: string;
  caption: string | null;
  type: string;
  views: number;
  createdAt: string;
  media?: { url: string; type?: string }[];
  _count: { likes: number; comments: number; bookmarks: number };
}

interface Props {
  stats?: CreatorStats;
  chartData?: CreatorChartDay[];
}

function formatReach(value?: number) {
  if (!value) return '0';
  if (value > 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  return value.toLocaleString();
}

export default function CreatorHeroCard({ stats, chartData }: Props) {
  const { t } = useTranslation();
  const isPositiveGrowth = (stats?.followerGrowth ?? 0) >= 0;

  return (
    <Card variant="glass" className="relative p-4 sm:p-5">
      {chartData && chartData.length > 0 ? (
        <div className="absolute bottom-0 left-0 right-0 h-24 opacity-20 pointer-events-none">
          <SafeResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--color-brand-primary)"
                    stopOpacity={0.6}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--color-brand-primary)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="views"
                stroke="var(--color-brand-primary)"
                strokeWidth={1.5}
                fill="url(#heroGrad)"
                animationDuration={800}
              />
            </AreaChart>
          </SafeResponsiveContainer>
        </div>
      ) : null}

      <div className="relative space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <p className="text-xs text-white/50 mb-1">
              {t('creator.dashboard.live_performance', 'Live performance')}
            </p>
            <div className="flex items-baseline gap-2">
              <h2 className="text-3xl font-semibold tracking-tight text-white tabular-nums">
                {stats?.followerCount.toLocaleString() || '0'}
              </h2>
              <span className="text-sm text-white/50">
                {t('creator.dashboard.total_followers', 'total followers')}
              </span>
            </div>
          </div>

          {stats?.followerGrowth !== undefined && (
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${
                isPositiveGrowth
                  ? 'bg-brand-primary/10 border-brand-primary/20 text-brand-primary'
                  : 'bg-brand-secondary/10 border-brand-secondary/20 text-brand-secondary'
              }`}
            >
              <TrendingUp
                size={14}
                className={!isPositiveGrowth ? 'rotate-180' : ''}
                aria-hidden
              />
              <span>
                {t('creator.dashboard.growth_this_month', {
                  sign: isPositiveGrowth ? '+' : '',
                  value: stats.followerGrowth,
                  defaultValue: '{{sign}}{{value}}% this month',
                })}
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <MetricTile
            icon={Zap}
            label={t('creator.dashboard.engagement', 'Engagement')}
            value={`${stats?.engagementRate || 0}%`}
          />
          <MetricTile
            icon={Users}
            label={t('creator.dashboard.total_reach', 'Total reach')}
            value={formatReach(stats?.totalReach)}
          />
          <MetricTile
            icon={DollarSign}
            label={t('creator.dashboard.mrr_est', 'Est. MRR')}
            value={`$${stats?.mrr || 0}`}
          />
          <MetricTile
            icon={Award}
            label={t('creator.dashboard.subscribers', 'Subscribers')}
            value={String(stats?.subscriberCount || 0)}
          />
        </div>
      </div>
    </Card>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
}: {
  icon: ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="p-3 rounded-lg bg-white/3 border border-white/5">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="text-brand-primary" aria-hidden />
        <span className="text-xs text-white/50">{label}</span>
      </div>
      <p className="text-lg font-semibold text-white tabular-nums">{value}</p>
    </div>
  );
}
