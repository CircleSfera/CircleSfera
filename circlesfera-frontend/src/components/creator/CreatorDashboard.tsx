import { useQuery } from '@tanstack/react-query';
import { Film, Image as ImageIcon, Megaphone } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  CreatorChartDay,
  CreatorPost,
  CreatorStats,
} from '../../services/creator.service';
import { creatorApi } from '../../services/creator.service';
import { monetizationApi } from '../../services/monetization.service';
import type { PaginatedResponse } from '../../types';
import { formatNumber } from '../../utils/format';
import { formatCents } from '../../utils/money';
import SafeResponsiveContainer from '../common/SafeResponsiveContainer';
import PostInsightsModal from '../modals/PostInsightsModal';
import { Button, Card } from '../ui';
import CreatorEmpty from './CreatorEmpty';
import {
  CreatorFigure,
  CreatorFigures,
  CreatorRow,
  CreatorSection,
} from './CreatorPieces';
import type { CreatorTab } from './creatorNav';
import { localHour, postFacts, weekdayName } from './creatorWords';

// A chart of fewer points than this says nothing: words take its place.
// Its days arrive as dates with no time, so they are written in universal
// time: in the reader's own, a day west of it would show as the day before.
const MIN_CHART_DAYS = 3;

export default function CreatorDashboard({
  onPromote,
  stats,
  chartData,
}: {
  onPromote: (post: CreatorPost) => void;
  // Kept for the page that mounts it; the sections are reached by links now.
  onNavigate?: (target: CreatorTab) => void;
  stats?: CreatorStats;
  chartData?: CreatorChartDay[];
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const [insightsPostId, setInsightsPostId] = useState<string | null>(null);

  const { data: recentPosts, isLoading: postsLoading } = useQuery<
    PaginatedResponse<CreatorPost>
  >({
    queryKey: ['creator', 'posts', 'top', 1],
    queryFn: () => creatorApi.getPosts(1, 4).then((r) => r.data),
  });

  const { data: monetization } = useQuery<{ lifetimeEarningsCents?: number }>({
    queryKey: ['monetization'],
    queryFn: monetizationApi.getMonetization,
  });

  const posts = recentPosts?.data ?? [];
  const days = chartData ?? [];
  const growth = stats?.followerGrowth ?? 0;

  // The best day and hour come from the likes received: with none, the server
  // still answers a day and an hour, which would not be a result.
  const hasLikes = (stats?.totalLikes ?? 0) > 0;

  return (
    <div className="space-y-8 pb-8">
      {insightsPostId && (
        <PostInsightsModal
          postId={insightsPostId}
          onClose={() => setInsightsPostId(null)}
        />
      )}

      <CreatorFigures>
        <CreatorFigure
          label={t('creator.overview.followers')}
          value={formatNumber(stats?.followerCount ?? 0, language)}
          hint={
            growth === 0
              ? t('creator.overview.followers_flat')
              : t('creator.overview.followers_change', {
                  value: `${growth > 0 ? '+' : ''}${formatNumber(growth, language)}`,
                })
          }
        />
        <CreatorFigure
          label={t('creator.overview.reach')}
          value={formatNumber(stats?.totalReach ?? 0, language)}
          hint={t('creator.overview.reach_hint')}
        />
        <CreatorFigure
          label={t('creator.overview.interaction')}
          value={`${formatNumber(stats?.engagementRate ?? 0, language)} %`}
          hint={t('creator.overview.interaction_hint')}
        />
        <CreatorFigure
          label={t('creator.overview.income')}
          value={formatCents(
            monetization?.lifetimeEarningsCents ?? 0,
            language,
          )}
          hint={t('creator.overview.income_hint')}
        />
      </CreatorFigures>

      <CreatorSection title={t('creator.overview.views_title')}>
        <Card variant="glass" className="p-4">
          {days.length >= MIN_CHART_DAYS ? (
            <div className="h-48 w-full">
              <SafeResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={days}
                  margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="overviewViews"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="var(--color-brand-primary)"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--color-brand-primary)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#ffffff"
                    strokeOpacity={0.05}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    stroke="#ffffff"
                    strokeOpacity={0.5}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    dy={8}
                    tickFormatter={(value) =>
                      new Date(value).toLocaleDateString(language, {
                        day: 'numeric',
                        month: 'short',
                        timeZone: 'UTC',
                      })
                    }
                  />
                  <YAxis
                    stroke="#ffffff"
                    strokeOpacity={0.5}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      borderColor: 'rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                    }}
                    itemStyle={{ fontSize: '12px', fontWeight: 600 }}
                    labelStyle={{ color: '#a1a1aa', fontSize: '11px' }}
                    labelFormatter={(value) =>
                      new Date(String(value)).toLocaleDateString(language, {
                        day: 'numeric',
                        month: 'long',
                        timeZone: 'UTC',
                      })
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="views"
                    name={t('creator.overview.views_series')}
                    stroke="var(--color-brand-primary)"
                    strokeWidth={2}
                    fill="url(#overviewViews)"
                  />
                </AreaChart>
              </SafeResponsiveContainer>
            </div>
          ) : (
            <p className="py-6 text-sm text-white/60 text-center">
              {t('creator.overview.views_few')}
            </p>
          )}
        </Card>
      </CreatorSection>

      <CreatorSection
        title={t('creator.overview.latest_posts')}
        link={
          posts.length > 0
            ? {
                label: t('creator.overview.see_all_posts'),
                to: '/creator/content',
              }
            : undefined
        }
      >
        {postsLoading ? (
          <div className="space-y-2">
            {['sk-1', 'sk-2', 'sk-3', 'sk-4'].map((id) => (
              <div
                key={id}
                className="h-20 md:h-15 rounded-xl bg-white/5 animate-pulse border border-white/5"
              />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <CreatorEmpty
            icon={ImageIcon}
            title={t('creator.posts.empty_title')}
            message={t('creator.posts.empty_desc')}
          />
        ) : (
          <div className="space-y-2">
            {posts.map((post) => {
              const title = post.caption || t('creator.post.untitled');
              return (
                <CreatorRow
                  key={post.id}
                  media={
                    post.media?.[0] ? (
                      <img
                        src={post.media[0].url}
                        className="w-full h-full object-cover"
                        alt=""
                      />
                    ) : post.type === 'FRAME' ? (
                      <Film size={20} aria-hidden />
                    ) : (
                      <ImageIcon size={20} aria-hidden />
                    )
                  }
                  title={title}
                  facts={postFacts(post, t, language)}
                  onOpen={() => setInsightsPostId(post.id)}
                  openLabel={t('creator.post.statistics_of', { title })}
                  action={
                    <Button
                      variant="ghost"
                      size="compact"
                      className="min-h-11 min-w-11 gap-1.5 shrink-0"
                      aria-label={t('creator.post.promote_this', { title })}
                      onClick={() => onPromote(post)}
                    >
                      <Megaphone size={16} aria-hidden />
                      <span className="hidden sm:inline">
                        {t('creator.post.promote')}
                      </span>
                    </Button>
                  }
                />
              );
            })}
          </div>
        )}
      </CreatorSection>

      <CreatorSection title={t('creator.overview.audience')}>
        <CreatorFigures>
          <CreatorFigure
            label={t('creator.overview.active_followers')}
            value={`${formatNumber(stats?.insights?.retentionRate ?? 0, language)} %`}
            hint={t('creator.overview.active_followers_hint')}
          />
          {hasLikes && stats?.insights ? (
            <>
              <CreatorFigure
                label={t('creator.overview.best_day')}
                value={weekdayName(stats.insights.bestDayToPost, language)}
                hint={t('creator.overview.best_day_hint')}
              />
              <CreatorFigure
                label={t('creator.overview.peak_hour')}
                value={localHour(stats.insights.bestHourToPost, language)}
                hint={t('creator.overview.peak_hour_hint')}
              />
            </>
          ) : null}
        </CreatorFigures>
      </CreatorSection>
    </div>
  );
}
