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
import CreatorHeroCard from './CreatorHeroCard';
import type { CreatorTab } from './creatorNav';

function SectionHeader({
  title,
  icon: Icon,
  onSeeAll,
  seeAllLabel,
}: {
  title: string;
  icon: React.ElementType;
  onSeeAll?: () => void;
  seeAllLabel?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between mb-3 sm:mb-4">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-brand-primary/15 flex items-center justify-center border border-brand-primary/25 text-brand-primary shrink-0">
          <Icon size={15} />
        </div>
        <h3 className="text-white font-bold text-sm sm:text-base tracking-tight">
          {title}
        </h3>
      </div>
      {onSeeAll && (
        <button
          type="button"
          onClick={onSeeAll}
          className="text-gray-400 hover:text-white transition-colors text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-1 group min-h-11 px-3"
        >
          {seeAllLabel || t('creator.dashboard.see_all', 'Ver todo')}
          <ChevronRight
            size={14}
            className="group-hover:translate-x-0.5 transition-transform text-brand-primary"
          />
        </button>
      )}
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

  // Queries
  const { data: recentPosts, isLoading: postsLoading } = useQuery<
    PaginatedResponse<CreatorPost>
  >({
    queryKey: ['creator', 'posts', 'top', 1],
    queryFn: () => creatorApi.getPosts(1, 4).then((r) => r.data),
  });

  return (
    <div className="space-y-6 pb-8">
      {/* Post Insights Modal */}
      {insightsPostId && (
        <PostInsightsModal
          postId={insightsPostId}
          onClose={() => setInsightsPostId(null)}
        />
      )}

      {/* Hero Overview Banner */}
      <CreatorHeroCard stats={stats} chartData={chartData} />

      {/* Content Performance Section */}
      <section>
        <SectionHeader
          title={t(
            'creator.dashboard.content_performance',
            'Rendimiento de Contenido',
          )}
          icon={Zap}
          onSeeAll={() => onNavigate('content')}
          seeAllLabel={t('creator.dashboard.see_all_content', 'Ver todo')}
        />

        {postsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {['sk-1', 'sk-2', 'sk-3', 'sk-4'].map((id) => (
              <div
                key={id}
                className="h-28 rounded-2xl bg-white/3 animate-pulse border border-white/6"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {recentPosts?.data.map((post) => (
              <motion.div
                whileHover={{ y: -2 }}
                transition={{ duration: 0.15 }}
                key={post.id}
                className="bg-zinc-950/80 backdrop-blur-xl p-3.5 sm:p-4 rounded-2xl border border-white/8 hover:border-brand-primary/30 flex items-center gap-3.5 transition-all cursor-pointer group shadow-lg"
                onClick={() => setInsightsPostId(post.id)}
              >
                <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-zinc-900 border border-white/10 text-gray-400 flex items-center justify-center relative">
                  {post.media?.[0] ? (
                    <img
                      src={post.media[0].url}
                      className="w-full h-full object-cover"
                      alt=""
                    />
                  ) : post.type === 'FRAME' ? (
                    <Film size={22} className="opacity-80" />
                  ) : (
                    <ImageIcon size={22} className="opacity-80" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="text-white font-bold text-xs sm:text-sm truncate">
                      {post.caption ||
                        t('creator.dashboard.untitled_post', 'Sin título')}
                    </p>
                    <span className="text-brand-primary text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-brand-primary/10 border border-brand-primary/20 rounded-md shrink-0">
                      {post.type}
                    </span>
                  </div>

                  {/* Performance score bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      <span>Score</span>
                      <span className="text-brand-primary font-mono font-bold">
                        {post.performanceScore || 0}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{
                          width: `${Math.min(post.performanceScore || 0, 100)}%`,
                        }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        className="h-full bg-linear-to-r from-brand-primary to-brand-secondary rounded-full"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!canPromote) {
                        toast(
                          t(
                            'creator.promotions.elite_required',
                            'Promotions are available on the Elite plan.',
                          ),
                          { icon: '✨' },
                        );
                        return;
                      }
                      onPromote(post);
                    }}
                    className="mt-2.5 inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-lg bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-[11px] font-bold hover:bg-brand-primary hover:text-white transition-all min-h-11"
                  >
                    <Megaphone size={12} />
                    {t('creator.dashboard.promote_post', 'Promocionar')}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Tools & Audience Insights Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Management Tools */}
        <section className="lg:col-span-2 space-y-3">
          <SectionHeader
            title={t(
              'creator.dashboard.studio_management',
              'Herramientas del Studio',
            )}
            icon={BarChart3}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onNavigate('monetization')}
              className="relative overflow-hidden bg-zinc-950/80 backdrop-blur-xl p-4 sm:p-5 rounded-2xl border border-white/8 hover:border-brand-primary/30 transition-all text-left group shadow-lg"
            >
              <div className="flex flex-col gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/4 flex items-center justify-center border border-white/10 group-hover:border-brand-primary/30 group-hover:bg-brand-primary/10 transition-all text-brand-primary shrink-0">
                  <DollarSign size={20} />
                </div>
                <div>
                  <h4 className="text-white font-bold text-sm mb-1 tracking-tight">
                    {t(
                      'creator.dashboard.finance_earnings',
                      'Gestión de Ingresos',
                    )}
                  </h4>
                  <p className="text-gray-400 text-xs leading-relaxed">
                    {t(
                      'creator.dashboard.finance_desc',
                      'Suscripciones, propinas, contenido bloqueado y payouts.',
                    )}
                  </p>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('ads')}
              className="relative overflow-hidden bg-zinc-950/80 backdrop-blur-xl p-4 sm:p-5 rounded-2xl border border-white/8 hover:border-brand-secondary/30 transition-all text-left group shadow-lg"
            >
              <div className="flex flex-col gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/4 flex items-center justify-center border border-white/10 group-hover:border-brand-secondary/30 group-hover:bg-brand-secondary/10 transition-all text-brand-secondary shrink-0">
                  <Megaphone size={20} />
                </div>
                <div>
                  <h4 className="text-white font-bold text-sm mb-1 tracking-tight">
                    {t(
                      'creator.dashboard.ads_promotions',
                      'Promoción y Campañas',
                    )}
                  </h4>
                  <p className="text-gray-400 text-xs leading-relaxed">
                    {t(
                      'creator.dashboard.ads_desc',
                      'Campañas y publicaciones patrocinadas para expandir tu alcance.',
                    )}
                  </p>
                </div>
              </div>
            </button>
          </div>
        </section>

        {/* Audience Retention Gauge */}
        <section className="space-y-3">
          <SectionHeader
            title={t('creator.dashboard.audience', 'Audiencia')}
            icon={Users}
          />
          <div className="bg-zinc-950/80 backdrop-blur-xl p-4 sm:p-5 rounded-2xl border border-white/8 flex flex-col items-center justify-center text-center shadow-lg h-[calc(100%-2.5rem)] relative overflow-hidden">
            <div className="relative w-28 h-28 mb-4" role="img">
              <svg
                aria-hidden="true"
                className="w-full h-full transform -rotate-90"
              >
                <circle
                  cx="56"
                  cy="56"
                  r="48"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  className="text-zinc-800"
                />
                <motion.circle
                  cx="56"
                  cy="56"
                  r="48"
                  stroke="var(--color-brand-primary)"
                  strokeWidth="8"
                  fill="transparent"
                  strokeLinecap="round"
                  strokeDasharray={301.5}
                  initial={{ strokeDashoffset: 301.5 }}
                  animate={{
                    strokeDashoffset:
                      301.5 * (1 - (stats?.insights.retentionRate || 0) / 100),
                  }}
                  transition={{ duration: 1.5, ease: 'easeOut' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-white font-black text-xl font-mono">
                  {stats?.insights.retentionRate || 0}%
                </span>
                <span className="text-brand-primary font-bold text-[9px] uppercase tracking-wider">
                  Retención
                </span>
              </div>
            </div>

            <div className="w-full grid grid-cols-2 gap-2 mt-auto">
              <div className="bg-white/3 p-2.5 rounded-xl border border-white/5 text-left">
                <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-0.5">
                  Mejor día
                </p>
                <p className="text-white font-bold text-xs">
                  {stats?.insights.bestDayToPost || 'Lunes'}
                </p>
              </div>
              <div className="bg-white/3 p-2.5 rounded-xl border border-white/5 text-left">
                <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-0.5">
                  Hora pico
                </p>
                <p className="text-white font-bold text-xs font-mono">
                  {stats?.insights.bestHourToPost || '20:00'}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Analytics Teaser */}
      <section className="pt-2">
        <button
          type="button"
          onClick={() => onNavigate('analytics')}
          className="w-full overflow-hidden bg-zinc-950/80 backdrop-blur-xl p-4 sm:p-6 rounded-2xl border border-white/8 flex flex-col sm:flex-row sm:items-center gap-4 hover:border-brand-primary/30 transition-all text-left group shadow-xl"
        >
          <div className="w-12 h-12 rounded-xl bg-brand-primary/10 flex items-center justify-center border border-brand-primary/20 text-brand-primary shrink-0">
            <BarChart3 size={24} />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-white font-bold text-base sm:text-lg mb-1 tracking-tight">
              {t(
                'creator.dashboard.analytics_teaser_title',
                'Analíticas Avanzadas',
              )}
            </h4>
            <p className="text-gray-400 text-xs sm:text-sm leading-relaxed max-w-xl">
              {t(
                'creator.dashboard.analytics_teaser_desc',
                'Analiza demografía de audiencia, fuentes de tráfico y comportamiento de conversión.',
              )}
            </p>
          </div>
          <span className="inline-flex items-center justify-center gap-1.5 bg-brand-primary text-white text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-xl shrink-0 hover:bg-brand-primary/90 transition-colors shadow-md">
            {t('creator.dashboard.see_analytics', 'Ver analíticas')}
            <ChevronRight
              size={14}
              className="group-hover:translate-x-0.5 transition-transform"
            />
          </span>
        </button>
      </section>
    </div>
  );
}
