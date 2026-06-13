import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  BarChart3,
  ChevronRight,
  DollarSign,
  Film,
  Image as ImageIcon,
  Megaphone,
  Users,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  CreatorChartDay,
  CreatorPost,
  CreatorStats,
} from '../../services/creator.service';
import { creatorApi } from '../../services/creator.service';
import type { PaginatedResponse } from '../../types';
import PostInsightsModal from '../modals/PostInsightsModal';
import CreatorHeroCard from './CreatorHeroCard';

// ─── Sub-components ─────────────────────────────────────────────

function SectionHeader({
  title,
  icon: Icon,
  onSeeAll,
  seeAllLabel = 'Ver todo',
}: {
  title: string;
  icon: React.ElementType;
  onSeeAll?: () => void;
  seeAllLabel?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-brand-primary/10 flex items-center justify-center border border-brand-primary/20">
          <Icon size={16} className="text-brand-primary" />
        </div>
        <h3 className="text-white font-black text-sm uppercase tracking-wider">
          {title}
        </h3>
      </div>
      {onSeeAll && (
        <button
          type="button"
          onClick={onSeeAll}
          className="text-zinc-500 hover:text-white transition-colors text-[10px] font-black uppercase tracking-widest flex items-center gap-1 group"
        >
          {seeAllLabel || t('creator.dashboard.see_all')}
          <ChevronRight
            size={12}
            className="group-hover:translate-x-0.5 transition-transform"
          />
        </button>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────

export default function CreatorDashboard({
  onPromote,
  onNavigate,
  stats,
  chartData,
}: {
  onPromote: (post: CreatorPost) => void;
  onNavigate: (target: 'content' | 'stories' | 'finance' | 'ads') => void;
  stats?: CreatorStats;
  chartData?: CreatorChartDay[];
}) {
  const { t } = useTranslation();
  const [insightsPostId, setInsightsPostId] = useState<string | null>(null);

  // Queries
  const { data: recentPosts, isLoading: postsLoading } = useQuery<
    PaginatedResponse<CreatorPost>
  >({
    queryKey: ['creator', 'posts', 'top', 1],
    queryFn: () => creatorApi.getPosts(1, 4).then((r) => r.data),
  });

  return (
    <div className="space-y-12 pb-20">
      {/* Post Insights Modal */}
      {insightsPostId && (
        <PostInsightsModal
          postId={insightsPostId}
          onClose={() => setInsightsPostId(null)}
        />
      )}

      {/* 0. Hero Section (Moved here for better layout flow) */}
      <CreatorHeroCard stats={stats} chartData={chartData} />

      {/* 1. Content Insights Section */}
      <section>
        <SectionHeader
          title={t('creator.dashboard.content_performance')}
          icon={Zap}
          onSeeAll={() => onNavigate('content')}
          seeAllLabel={t('creator.dashboard.see_all_content')}
        />

        {postsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {['sk-1', 'sk-2', 'sk-3', 'sk-4'].map((id) => (
              <div
                key={id}
                className="h-32 rounded-3xl bg-white/5 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {recentPosts?.data.map((post) => (
              <motion.div
                whileHover={{ scale: 1.01 }}
                key={post.id}
                className="glass-panel p-4 rounded-2xl border border-white/5 flex items-center gap-5 hover:bg-white/5 transition-all cursor-pointer group/card"
                onClick={() => setInsightsPostId(post.id)}
              >
                <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-zinc-900 border border-white/5 text-zinc-800 flex items-center justify-center relative">
                  {post.media?.[0] ? (
                    <img
                      src={post.media[0].url}
                      className="w-full h-full object-cover"
                      alt=""
                    />
                  ) : post.type === 'FRAME' ? (
                    <Film size={24} />
                  ) : (
                    <ImageIcon size={24} />
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPromote(post);
                    }}
                    className="absolute inset-0 bg-brand-primary/20 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center justify-center hover:bg-brand-primary/40"
                    title={t('creator.dashboard.promote_post')}
                  >
                    <Megaphone size={20} className="text-white" />
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-white font-bold text-sm truncate">
                      {post.caption || t('creator.dashboard.untitled_post')}
                    </p>
                    <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">
                      {post.type}
                    </span>
                  </div>

                  {/* Premium Performance Bar */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-zinc-500 italic">
                      <span>{t('creator.dashboard.performance')}</span>
                      <span className="text-brand-primary">
                        {t('creator.dashboard.vs_avg', {
                          score: post.performanceScore || 0,
                        })}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{
                          width: `${Math.min(post.performanceScore || 0, 100)}%`,
                        }}
                        transition={{ duration: 1.5, ease: 'easeOut' }}
                        className="h-full bg-linear-to-r from-brand-primary to-purple-500 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.4)]"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* 2. Quick Strategy & Tools */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Tool Cards */}
        <section className="lg:col-span-2 space-y-6">
          <SectionHeader
            title={t('creator.dashboard.studio_management')}
            icon={BarChart3}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => onNavigate('finance')}
              className="glass-panel p-5 rounded-2xl border border-white/5 flex flex-col gap-4 hover:bg-white/5 transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:bg-white/10 transition-colors">
                <DollarSign size={20} className="text-zinc-300" />
              </div>
              <div>
                <h4 className="text-white font-bold text-lg mb-1 tracking-tight">
                  {t('creator.dashboard.finance_earnings')}
                </h4>
                <p className="text-zinc-500 text-sm leading-relaxed">
                  {t('creator.dashboard.finance_desc')}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('ads')}
              className="glass-panel p-5 rounded-2xl border border-white/5 flex flex-col gap-4 hover:bg-white/5 transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:bg-white/10 transition-colors">
                <Megaphone size={20} className="text-zinc-300" />
              </div>
              <div>
                <h4 className="text-white font-bold text-lg mb-1 tracking-tight">
                  {t('creator.dashboard.ads_promotions')}
                </h4>
                <p className="text-zinc-500 text-sm leading-relaxed">
                  {t('creator.dashboard.ads_desc')}
                </p>
              </div>
            </button>
          </div>
        </section>

        {/* Mini Audiencia Insights */}
        <section className="space-y-6">
          <SectionHeader title={t('creator.dashboard.audience')} icon={Users} />
          <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col items-center text-center">
            <div
              className="relative w-32 h-32 mb-6"
              role="img"
              aria-label={t('creator.dashboard.retention_chart_aria', {
                rate: stats?.insights.retentionRate || 0,
              })}
            >
              <svg
                aria-hidden="true"
                className="w-full h-full transform -rotate-90"
              >
                <circle
                  cx="64"
                  cy="64"
                  r="58"
                  stroke="currentColor"
                  strokeWidth="12"
                  fill="transparent"
                  className="text-white/5"
                />
                <motion.circle
                  cx="64"
                  cy="64"
                  r="58"
                  stroke="currentColor"
                  strokeWidth="12"
                  fill="transparent"
                  strokeDasharray={364}
                  initial={{ strokeDashoffset: 364 }}
                  animate={{
                    strokeDashoffset:
                      364 * (1 - (stats?.insights.retentionRate || 0) / 100),
                  }}
                  transition={{ duration: 2, ease: 'easeOut' }}
                  className="text-brand-primary"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-white font-black text-xl leading-none">
                  {stats?.insights.retentionRate || 0}%
                </span>
                <span className="text-zinc-500 text-[8px] font-black uppercase tracking-tighter">
                  {t('creator.dashboard.retention')}
                </span>
              </div>
            </div>
            <p className="text-white font-medium text-sm mb-1">
              {t('creator.dashboard.most_active_day', {
                day: stats?.insights.bestDayToPost,
              })}
            </p>
            <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">
              {t('creator.dashboard.most_active_hour', {
                hour: stats?.insights.bestHourToPost,
              })}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
