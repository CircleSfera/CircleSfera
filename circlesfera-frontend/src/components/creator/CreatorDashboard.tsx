import { useQuery } from '@tanstack/react-query';
import { Image as ImageIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import PostInsightsModal from '../modals/PostInsightsModal';
import CreatorEmpty from './CreatorEmpty';
import { CreatorFigure, CreatorFigures, CreatorSection } from './CreatorPieces';
import CreatorPostRow from './CreatorPostRow';
import CreatorTrendChart from './CreatorTrendChart';
import type { CreatorTab } from './creatorNav';
import { chartDay, localHour, weekdayName } from './creatorWords';

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
        <CreatorTrendChart
          data={days}
          xKey="date"
          series={[
            {
              key: 'views',
              name: t('creator.overview.views_series'),
              color: 'var(--color-brand-primary)',
            },
          ]}
          formatX={(value, long) => chartDay(value, long, language)}
          fewText={t('creator.overview.views_few')}
        />
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
            {posts.map((post) => (
              <CreatorPostRow
                key={post.id}
                post={post}
                onOpen={(opened) => setInsightsPostId(opened.id)}
                onPromote={onPromote}
              />
            ))}
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
              {stats.insights.bestDayToPost ? (
                <CreatorFigure
                  label={t('creator.overview.best_day')}
                  value={weekdayName(stats.insights.bestDayToPost, language)}
                  hint={t('creator.overview.best_day_hint')}
                />
              ) : null}
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
