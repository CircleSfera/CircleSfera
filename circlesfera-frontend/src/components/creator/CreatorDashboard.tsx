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
        <h3 className="text-white font-semibold text-base tracking-wide">
          {title}
        </h3>
      </div>
      {onSeeAll && (
        <button
          type="button"
          onClick={onSeeAll}
          className="text-gray-400 hover:text-white transition-colors text-xs font-semibold uppercase tracking-wide flex items-center gap-1 group min-h-11"
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
  const { profile } = useAuthStore();
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {['sk-1', 'sk-2', 'sk-3', 'sk-4'].map((id) => (
              <div
                key={id}
                className="h-32 rounded-3xl bg-white/5 animate-pulse border border-white/5"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {recentPosts?.data.map((post) => (
              <motion.div
                whileHover={{ y: -4, scale: 1.01 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                key={post.id}
                className="bg-black/60 backdrop-blur-2xl p-5 rounded-3xl border border-white/10 hover:border-brand-primary/30 flex items-center gap-5 transition-all cursor-pointer group/card shadow-[0_4px_24px_rgba(0,0,0,0.4)] hover:shadow-[0_8px_32px_rgba(var(--brand-primary),0.2)]"
                onClick={() => setInsightsPostId(post.id)}
              >
                <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 bg-white/5 border border-white/10 text-gray-400 flex items-center justify-center relative shadow-inner">
                  <div className="absolute inset-0 bg-linear-to-tr from-brand-primary/20 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity z-10" />
                  {post.media?.[0] ? (
                    <img
                      src={post.media[0].url}
                      className="w-full h-full object-cover relative z-0"
                      alt=""
                    />
                  ) : post.type === 'FRAME' ? (
                    <Film size={28} className="relative z-0 opacity-80" />
                  ) : (
                    <ImageIcon size={28} className="relative z-0 opacity-80" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <p className="text-white font-bold text-[15px] truncate drop-shadow-sm">
                      {post.caption ||
                        t('creator.dashboard.untitled_post', 'Sin título')}
                    </p>
                    <span className="text-brand-primary text-[10px] font-bold uppercase tracking-wider px-2 py-1 bg-brand-primary/10 border border-brand-primary/20 rounded-lg shrink-0">
                      {post.type}
                    </span>
                  </div>

                  {/* Performance Bar */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      <span>Rendimiento</span>
                      <span className="text-brand-primary drop-shadow-[0_0_8px_rgba(var(--brand-primary),0.6)]">
                        {post.performanceScore || 0}% vs prom.
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 shadow-inner">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{
                          width: `${Math.min(post.performanceScore || 0, 100)}%`,
                        }}
                        transition={{ duration: 1.2, ease: 'easeOut' }}
                        className="h-full bg-linear-to-r from-brand-primary via-purple-400 to-brand-secondary rounded-full shadow-[0_0_12px_rgba(var(--brand-primary),0.8)]"
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
                    className="mt-3.5 inline-flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2 rounded-xl bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-xs font-bold hover:bg-brand-primary hover:text-white hover:border-brand-primary transition-all shadow-lg"
                    title={
                      canPromote
                        ? t(
                            'creator.dashboard.promote_post',
                            'Promocionar publicación',
                          )
                        : t(
                            'creator.promotions.elite_required',
                            'Promotions are available on the Elite plan.',
                          )
                    }
                  >
                    <Megaphone size={14} />
                    {t('creator.dashboard.promote_post', 'Promocionar')}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Quick Studio Tools & Audience */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Tool Cards */}
        <section className="lg:col-span-2 space-y-5">
          <SectionHeader
            title={t(
              'creator.dashboard.studio_management',
              'Herramientas del Studio',
            )}
            icon={BarChart3}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <button
              type="button"
              onClick={() => onNavigate('monetization')}
              className="relative overflow-hidden bg-black/60 backdrop-blur-2xl p-6 rounded-3xl border border-white/10 hover:border-brand-primary/30 transition-all text-left group shadow-lg"
            >
              <div className="absolute inset-0 bg-radial-[at_0%_0%] from-brand-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10 flex flex-col gap-5">
                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-brand-primary/30 group-hover:bg-brand-primary/10 transition-all text-brand-primary shadow-inner">
                  <DollarSign size={28} />
                </div>
                <div>
                  <h4 className="text-white font-bold text-lg mb-1.5 tracking-tight drop-shadow-sm">
                    {t(
                      'creator.dashboard.finance_earnings',
                      'Gestión de Ingresos',
                    )}
                  </h4>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    {t(
                      'creator.dashboard.finance_desc',
                      'Consulta tus métricas de suscripciones, propinas y payouts.',
                    )}
                  </p>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('ads')}
              className="relative overflow-hidden bg-black/60 backdrop-blur-2xl p-6 rounded-3xl border border-white/10 hover:border-brand-secondary/30 transition-all text-left group shadow-lg"
            >
              <div className="absolute inset-0 bg-radial-[at_100%_0%] from-brand-secondary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10 flex flex-col gap-5">
                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-brand-secondary/30 group-hover:bg-brand-secondary/10 transition-all text-brand-secondary shadow-inner">
                  <Megaphone size={28} />
                </div>
                <div>
                  <h4 className="text-white font-bold text-lg mb-1.5 tracking-tight drop-shadow-sm">
                    {t(
                      'creator.dashboard.ads_promotions',
                      'Promoción y Campañas',
                    )}
                  </h4>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    {t(
                      'creator.dashboard.ads_desc',
                      'Impulsa tus publicaciones para llegar a más audiencia.',
                    )}
                  </p>
                </div>
              </div>
            </button>
          </div>
        </section>

        {/* Audience Retention Gauge */}
        <section className="space-y-5">
          <SectionHeader
            title={t('creator.dashboard.audience', 'Audiencia')}
            icon={Users}
          />
          <div className="bg-black/60 backdrop-blur-2xl p-6 rounded-3xl border border-white/10 flex flex-col items-center justify-center text-center shadow-lg h-[calc(100%-3rem)] relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-[40%] bg-brand-primary/10 blur-[60px] rounded-full pointer-events-none" />

            <div
              className="relative w-36 h-36 mb-6 mt-2"
              role="img"
              aria-label={t('creator.dashboard.retention_chart_aria', {
                rate: stats?.insights.retentionRate || 0,
              })}
            >
              <svg
                aria-hidden="true"
                className="w-full h-full transform -rotate-90 drop-shadow-[0_0_15px_rgba(var(--brand-primary),0.3)]"
              >
                <defs>
                  <linearGradient
                    id="ringGrad"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="var(--color-brand-primary)" />
                    <stop
                      offset="100%"
                      stopColor="var(--color-brand-secondary)"
                    />
                  </linearGradient>
                </defs>
                <circle
                  cx="72"
                  cy="72"
                  r="62"
                  stroke="currentColor"
                  strokeWidth="12"
                  fill="transparent"
                  className="text-white/5"
                />
                <motion.circle
                  cx="72"
                  cy="72"
                  r="62"
                  stroke="url(#ringGrad)"
                  strokeWidth="12"
                  fill="transparent"
                  strokeLinecap="round"
                  strokeDasharray={389.5}
                  initial={{ strokeDashoffset: 389.5 }}
                  animate={{
                    strokeDashoffset:
                      389.5 * (1 - (stats?.insights.retentionRate || 0) / 100),
                  }}
                  transition={{ duration: 2, ease: 'easeOut', delay: 0.2 }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-white font-black text-3xl leading-none tracking-tighter">
                  {stats?.insights.retentionRate || 0}%
                </span>
                <span className="text-brand-primary font-bold text-[10px] uppercase tracking-[0.2em] mt-1.5">
                  Retención
                </span>
              </div>
            </div>

            <div className="w-full grid grid-cols-2 gap-3 mt-auto">
              <div className="bg-white/5 p-3 rounded-xl border border-white/5 text-left">
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-0.5">
                  Mejor día
                </p>
                <p className="text-white font-bold text-sm">
                  {stats?.insights.bestDayToPost || 'Lunes'}
                </p>
              </div>
              <div className="bg-white/5 p-3 rounded-xl border border-white/5 text-left">
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-0.5">
                  Hora pico
                </p>
                <p className="text-white font-bold text-sm">
                  {stats?.insights.bestHourToPost || '20:00'}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Analytics teaser — deep link to analytics tab */}
      <section className="pt-8">
        <button
          type="button"
          onClick={() => onNavigate('analytics')}
          className="relative w-full overflow-hidden bg-black/60 backdrop-blur-3xl p-6 sm:p-8 rounded-3xl border border-white/10 flex flex-col sm:flex-row sm:items-center gap-6 hover:border-brand-primary/40 transition-all text-left group shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
        >
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute right-0 top-0 bottom-0 w-1/2 bg-linear-to-l from-brand-primary/10 to-transparent opacity-50 group-hover:opacity-100 transition-opacity" />
          </div>

          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:scale-110 group-hover:rotate-3 group-hover:border-brand-primary/30 group-hover:text-brand-primary group-hover:bg-brand-primary/10 transition-all text-gray-300 shrink-0 relative z-10 shadow-inner">
            <BarChart3 size={32} />
          </div>
          <div className="flex-1 min-w-0 relative z-10">
            <h4 className="text-white font-bold text-xl sm:text-2xl mb-2 tracking-tight">
              {t(
                'creator.dashboard.analytics_teaser_title',
                'Analíticas avanzadas',
              )}
            </h4>
            <p className="text-gray-400 text-sm sm:text-base leading-relaxed max-w-2xl">
              {t(
                'creator.dashboard.analytics_teaser_desc',
                'Explora evolución de audiencia, geografía, retención y horas pico.',
              )}
            </p>
          </div>
          <span className="inline-flex items-center justify-center gap-2 bg-brand-primary text-white text-xs font-bold uppercase tracking-wider px-6 py-3 rounded-xl sm:min-h-0 relative z-10 hover:bg-brand-primary/90 transition-colors shadow-[0_0_20px_rgba(var(--brand-primary),0.4)]">
            {t('creator.dashboard.see_analytics', 'Ver analíticas')}
            <ChevronRight
              size={16}
              className="group-hover:translate-x-1 transition-transform"
            />
          </span>
        </button>
      </section>
    </div>
  );
}
