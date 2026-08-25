import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  ChevronRight,
  DollarSign,
  Film,
  Image as ImageIcon,
  Megaphone,
} from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import type {
  CreatorChartDay,
  CreatorPost,
  CreatorStats,
} from '../../services/creator.service';
import { creatorApi } from '../../services/creator.service';
import { useAuthStore } from '../../stores/authStore';
import type { PaginatedResponse } from '../../types';
import PostInsightsModal from '../modals/PostInsightsModal';
import { Button, Card } from '../ui';
import CreatorEmpty from './CreatorEmpty';
import CreatorHeroCard from './CreatorHeroCard';
import type { CreatorTab } from './creatorNav';

function SectionHeader({
  title,
  onSeeAll,
  seeAllLabel,
}: {
  title: string;
  onSeeAll?: () => void;
  seeAllLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="text-lg font-semibold text-white tracking-tight">
        {title}
      </h2>
      {onSeeAll ? (
        <button
          type="button"
          onClick={onSeeAll}
          className="text-sm text-white/50 hover:text-white transition-colors inline-flex items-center gap-1 min-h-11 px-2"
        >
          {seeAllLabel}
          <ChevronRight size={14} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export default function CreatorDashboard({
  onPromote,
  onNavigate,
  stats,
  chartData,
}: {
  onPromote: (post: CreatorPost) => void;
  onNavigate: (target: CreatorTab) => void;
  stats?: CreatorStats;
  chartData?: CreatorChartDay[];
}) {
  const { t } = useTranslation();
  const profile = useAuthStore((state) => state.profile);
  const verificationLevel =
    profile?.user?.verificationLevel || profile?.verificationLevel;
  const canPromote = verificationLevel === 'ELITE';
  const [insightsPostId, setInsightsPostId] = useState<string | null>(null);

  const { data: recentPosts, isLoading: postsLoading } = useQuery<
    PaginatedResponse<CreatorPost>
  >({
    queryKey: ['creator', 'posts', 'top', 1],
    queryFn: () => creatorApi.getPosts(1, 4).then((r) => r.data),
  });

  const posts = recentPosts?.data ?? [];

  return (
    <div className="space-y-8 pb-8">
      {insightsPostId && (
        <PostInsightsModal
          postId={insightsPostId}
          onClose={() => setInsightsPostId(null)}
        />
      )}

      <CreatorHeroCard stats={stats} chartData={chartData} />

      <section>
        <SectionHeader
          title={t(
            'creator.dashboard.content_performance',
            'Content performance',
          )}
          onSeeAll={() => onNavigate('content')}
          seeAllLabel={t('creator.dashboard.see_all_content', 'See all')}
        />

        {postsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {['sk-1', 'sk-2', 'sk-3', 'sk-4'].map((id) => (
              <div
                key={id}
                className="h-24 rounded-xl bg-white/5 animate-pulse border border-white/5"
              />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <CreatorEmpty
            icon={ImageIcon}
            title={t('creator.posts.empty_title', 'No posts yet')}
            message={t(
              'creator.posts.empty_desc',
              'Publish your first post to see it here.',
            )}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {posts.map((post) => (
              <Card
                key={post.id}
                variant="glass"
                className="p-3.5 flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => setInsightsPostId(post.id)}
              >
                <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-surface-raised border border-white/10 text-white/40 flex items-center justify-center">
                  {post.media?.[0] ? (
                    <img
                      src={post.media[0].url}
                      className="w-full h-full object-cover"
                      alt=""
                    />
                  ) : post.type === 'FRAME' ? (
                    <Film size={20} aria-hidden />
                  ) : (
                    <ImageIcon size={20} aria-hidden />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-white text-sm font-medium truncate">
                      {post.caption ||
                        t('creator.dashboard.untitled_post', 'Untitled post')}
                    </p>
                    <span className="text-[11px] text-white/50 shrink-0">
                      {post.type}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-white/40 mb-1">
                    <span>
                      {t('creator.dashboard.performance', 'Performance')}
                    </span>
                    <span className="tabular-nums text-white/70">
                      {post.performanceScore || 0}%
                    </span>
                  </div>
                  <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-primary rounded-full"
                      style={{
                        width: `${Math.min(post.performanceScore || 0, 100)}%`,
                      }}
                    />
                  </div>

                  <Button
                    variant="ghost"
                    size="compact"
                    className="mt-2 min-h-11 gap-1.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!canPromote) {
                        toast(
                          t(
                            'creator.promotions.elite_required',
                            'Promotions are available on the Elite plan.',
                          ),
                        );
                        return;
                      }
                      onPromote(post);
                    }}
                  >
                    <Megaphone size={14} aria-hidden />
                    {t('creator.dashboard.promote_post', 'Promote')}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2">
          <SectionHeader
            title={t(
              'creator.dashboard.studio_management',
              'Studio management',
            )}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onNavigate('monetization')}
              className="glass-panel p-4 rounded-xl border border-white/5 hover:bg-white/5 transition-colors text-left min-h-11"
            >
              <DollarSign
                size={18}
                className="text-brand-primary mb-3"
                aria-hidden
              />
              <h3 className="text-white text-sm font-medium mb-1">
                {t('creator.dashboard.finance_earnings', 'Finance & earnings')}
              </h3>
              <p className="text-xs text-white/50 leading-relaxed">
                {t(
                  'creator.dashboard.finance_desc',
                  'Subscriptions, tips, locked content and payouts.',
                )}
              </p>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('ads')}
              className="glass-panel p-4 rounded-xl border border-white/5 hover:bg-white/5 transition-colors text-left min-h-11"
            >
              <Megaphone
                size={18}
                className="text-brand-primary mb-3"
                aria-hidden
              />
              <h3 className="text-white text-sm font-medium mb-1">
                {t('creator.dashboard.ads_promotions', 'Ads & campaigns')}
              </h3>
              <p className="text-xs text-white/50 leading-relaxed">
                {t(
                  'creator.dashboard.ads_desc',
                  'Campaigns and sponsored posts to grow your reach.',
                )}
              </p>
            </button>
          </div>
        </section>

        <section>
          <SectionHeader title={t('creator.dashboard.audience', 'Audience')} />
          <Card
            variant="glass"
            className="p-4 flex flex-col items-center text-center"
          >
            <div
              className="relative w-28 h-28 mb-4"
              role="img"
              aria-label={t('creator.dashboard.retention_chart_aria', {
                rate: stats?.insights.retentionRate || 0,
                defaultValue: 'Retention: {{rate}}%',
              })}
            >
              <svg aria-hidden="true" className="w-full h-full -rotate-90">
                <circle
                  cx="56"
                  cy="56"
                  r="48"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  className="text-white/10"
                />
                <circle
                  cx="56"
                  cy="56"
                  r="48"
                  stroke="var(--color-brand-primary)"
                  strokeWidth="8"
                  fill="transparent"
                  strokeLinecap="round"
                  strokeDasharray={301.5}
                  strokeDashoffset={
                    301.5 * (1 - (stats?.insights.retentionRate || 0) / 100)
                  }
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-white font-semibold text-xl tabular-nums">
                  {stats?.insights.retentionRate || 0}%
                </span>
                <span className="text-white/50 text-[11px]">
                  {t('creator.dashboard.retention', 'Retention')}
                </span>
              </div>
            </div>

            <div className="w-full grid grid-cols-2 gap-2">
              <div className="bg-white/3 p-2.5 rounded-lg border border-white/5 text-left">
                <p className="text-white/40 text-[11px] mb-0.5">
                  {t('creator.dashboard.best_day', 'Best day')}
                </p>
                <p className="text-white text-sm font-medium">
                  {stats?.insights.bestDayToPost || '—'}
                </p>
              </div>
              <div className="bg-white/3 p-2.5 rounded-lg border border-white/5 text-left">
                <p className="text-white/40 text-[11px] mb-0.5">
                  {t('creator.dashboard.peak_hour', 'Peak hour')}
                </p>
                <p className="text-white text-sm font-medium tabular-nums">
                  {stats?.insights.bestHourToPost || '—'}
                </p>
              </div>
            </div>
          </Card>
        </section>
      </div>

      <button
        type="button"
        onClick={() => onNavigate('analytics')}
        className="w-full glass-panel p-4 rounded-xl border border-white/5 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-white/5 transition-colors text-left"
      >
        <div className="w-11 h-11 rounded-xl bg-brand-primary/15 flex items-center justify-center text-brand-primary shrink-0">
          <BarChart3 size={20} aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-medium mb-0.5">
            {t(
              'creator.dashboard.analytics_teaser_title',
              'Advanced analytics',
            )}
          </h3>
          <p className="text-white/50 text-sm leading-relaxed">
            {t(
              'creator.dashboard.analytics_teaser_desc',
              'Audience growth, geography, retention and peak hours.',
            )}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-primary shrink-0 min-h-11">
          {t('creator.dashboard.see_analytics', 'View analytics')}
          <ChevronRight size={14} aria-hidden />
        </span>
      </button>
    </div>
  );
}
