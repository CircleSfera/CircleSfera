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
import { CreatorAnalyticsDashboard } from './CreatorAnalyticsDashboard';
import CreatorHeroCard from './CreatorHeroCard';

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
        <div className="w-9 h-9 rounded-xl bg-brand-primary/10 flex items-center justify-center border border-brand-primary/20 text-brand-primary shadow-[0_0_15px_rgba(var(--brand-primary),0.15)]">
          <Icon size={18} />
        </div>
        <h3 className="text-white font-black text-base uppercase tracking-wider">
          {title}
        </h3>
      </div>
      {onSeeAll && (
        <button
          type="button"
          onClick={onSeeAll}
          className="text-gray-400 hover:text-white transition-colors text-xs font-black uppercase tracking-wide flex items-center gap-1 group"
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
    <div className="space-y-8 pb-12">
      {/* Post Insights Modal */}
      {insightsPostId && (
        <PostInsightsModal
          postId={insightsPostId}
          onClose={() => setInsightsPostId(null)}
        />
      )}

      {/* Hero Overview Card */}
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
          seeAllLabel={t(
            'creator.dashboard.see_all_content',
            'Ver todo el contenido',
          )}
        />

        {postsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {['sk-1', 'sk-2', 'sk-3', 'sk-4'].map((id) => (
              <div
                key={id}
                className="h-32 rounded-2xl bg-white/5 animate-pulse border border-white/5"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recentPosts?.data.map((post) => (
              <motion.div
                whileHover={{ scale: 1.01 }}
                key={post.id}
                className="bg-black/40 backdrop-blur-xl p-4 rounded-2xl border border-white/10 flex items-center gap-4 hover:bg-white/5 transition-all cursor-pointer group/card shadow-lg"
                onClick={() => setInsightsPostId(post.id)}
              >
                <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-black/60 border border-white/10 text-gray-400 flex items-center justify-center relative">
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
                    className="absolute inset-0 bg-brand-primary/40 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center justify-center hover:bg-brand-primary/60"
                    title={t(
                      'creator.dashboard.promote_post',
                      'Promocionar publicación',
                    )}
                  >
                    <Megaphone size={20} className="text-white" />
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-white font-bold text-sm truncate">
                      {post.caption ||
                        t('creator.dashboard.untitled_post', 'Sin título')}
                    </p>
                    <span className="text-brand-primary text-[10px] font-black uppercase tracking-wider px-2 py-0.5 bg-brand-primary/10 border border-brand-primary/20 rounded-md">
                      {post.type}
                    </span>
                  </div>

                  {/* Performance Bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-gray-400">
                      <span>Rendimiento</span>
                      <span className="text-brand-primary font-black">
                        {post.performanceScore || 0}% vs prom.
                      </span>
                    </div>
                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{
                          width: `${Math.min(post.performanceScore || 0, 100)}%`,
                        }}
                        transition={{ duration: 1.2, ease: 'easeOut' }}
                        className="h-full bg-linear-to-r from-brand-primary to-purple-500 rounded-full shadow-[0_0_10px_rgba(var(--brand-primary),0.4)]"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Quick Studio Tools & Audience */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tool Cards */}
        <section className="lg:col-span-2 space-y-4">
          <SectionHeader
            title={t(
              'creator.dashboard.studio_management',
              'Herramientas del Studio',
            )}
            icon={BarChart3}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => onNavigate('finance')}
              className="bg-black/40 backdrop-blur-xl p-5 rounded-2xl border border-white/10 flex flex-col gap-4 hover:bg-white/5 hover:border-white/20 transition-all text-left group shadow-lg"
            >
              <div className="w-12 h-12 rounded-xl bg-brand-primary/10 flex items-center justify-center border border-brand-primary/20 group-hover:scale-110 transition-transform text-brand-primary">
                <DollarSign size={24} />
              </div>
              <div>
                <h4 className="text-white font-black text-base mb-1 tracking-tight">
                  {t(
                    'creator.dashboard.finance_earnings',
                    'Gestión de Ingresos',
                  )}
                </h4>
                <p className="text-gray-400 text-xs leading-relaxed">
                  {t(
                    'creator.dashboard.finance_desc',
                    'Consulta tus métricas de suscripciones, propinas y payouts.',
                  )}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('ads')}
              className="bg-black/40 backdrop-blur-xl p-5 rounded-2xl border border-white/10 flex flex-col gap-4 hover:bg-white/5 hover:border-white/20 transition-all text-left group shadow-lg"
            >
              <div className="w-12 h-12 rounded-xl bg-brand-secondary/10 flex items-center justify-center border border-brand-secondary/20 group-hover:scale-110 transition-transform text-brand-secondary">
                <Megaphone size={24} />
              </div>
              <div>
                <h4 className="text-white font-black text-base mb-1 tracking-tight">
                  {t(
                    'creator.dashboard.ads_promotions',
                    'Promoción y Campañas',
                  )}
                </h4>
                <p className="text-gray-400 text-xs leading-relaxed">
                  {t(
                    'creator.dashboard.ads_desc',
                    'Impulsa tus publicaciones para llegar a más audiencia.',
                  )}
                </p>
              </div>
            </button>
          </div>
        </section>

        {/* Audience Retention Gauge */}
        <section className="space-y-4">
          <SectionHeader
            title={t('creator.dashboard.audience', 'Audiencia')}
            icon={Users}
          />
          <div className="bg-black/40 backdrop-blur-xl p-5 rounded-2xl border border-white/10 flex flex-col items-center text-center shadow-lg">
            <div
              className="relative w-32 h-32 mb-4"
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
                  r="56"
                  stroke="currentColor"
                  strokeWidth="10"
                  fill="transparent"
                  className="text-white/5"
                />
                <motion.circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="10"
                  fill="transparent"
                  strokeDasharray={351}
                  initial={{ strokeDashoffset: 351 }}
                  animate={{
                    strokeDashoffset:
                      351 * (1 - (stats?.insights.retentionRate || 0) / 100),
                  }}
                  transition={{ duration: 1.8, ease: 'easeOut' }}
                  className="text-brand-primary"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-white font-black text-2xl leading-none">
                  {stats?.insights.retentionRate || 0}%
                </span>
                <span className="text-gray-400 text-[10px] font-black uppercase tracking-wider mt-1">
                  Retención
                </span>
              </div>
            </div>

            <p className="text-white font-bold text-xs mb-1">
              Mejor día:{' '}
              <span className="text-brand-primary">
                {stats?.insights.bestDayToPost || 'Lunes'}
              </span>
            </p>
            <p className="text-gray-400 text-xs">
              Hora pico:{' '}
              <span className="text-white font-bold">
                {stats?.insights.bestHourToPost || '20:00'}
              </span>
            </p>
          </div>
        </section>
      </div>

      {/* Advanced Creator Analytics Section */}
      <section className="pt-4 border-t border-white/5">
        <CreatorAnalyticsDashboard />
      </section>
    </div>
  );
}
