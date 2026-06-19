import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  Bookmark,
  Eye,
  Heart,
  MessageCircle,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { creatorApi } from '../../services/creator.service';
import SafeResponsiveContainer from '../common/SafeResponsiveContainer';
import { Button } from '../ui';

interface Props {
  postId: string;
  onClose: () => void;
}

export default function PostInsightsModal({ postId, onClose }: Props) {
  const { t } = useTranslation();
  const { data: insights, isLoading } = useQuery({
    queryKey: ['post-insights', postId],
    queryFn: () => creatorApi.getPostInsights(postId).then((r) => r.data),
  });

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />

        {/* Modal Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-2xl bg-zinc-950 border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="p-6 md:p-8 border-b border-white/5 flex items-center justify-between bg-white/2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center border border-brand-primary/20">
                <BarChart3 size={20} className="text-brand-primary" />
              </div>
              <div>
                <h3 className="text-white font-black text-lg leading-none">
                  {t('modals.insights.post_stats')}
                </h3>
                <p className="text-zinc-500 text-xs font-bold uppercase tracking-wide mt-1.5">
                  {t('modals.insights.realtime_metrics')}
                </p>
              </div>
            </div>
            <Button
              onClick={onClose}
              variant="ghost"
              size="icon"
              className="w-10 h-10 rounded-full hover:bg-white/5 text-zinc-500 hover:text-white"
            >
              <X size={20} />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-4 custom-scrollbar">
            {isLoading ? (
              <div className="space-y-4 animate-pulse">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-24 bg-white/5 rounded-xl" />
                  ))}
                </div>
                <div className="h-64 bg-white/5 rounded-xl" />
              </div>
            ) : insights ? (
              <>
                {/* 1. Quick Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard
                    label={t('modals.insights.views')}
                    value={insights.post.views}
                    icon={Eye}
                    color="text-blue-400"
                    bg="bg-blue-400/10"
                  />
                  {insights.post.type === 'FRAME' ? (
                    <>
                      <StatCard
                        label={t('modals.insights.loops')}
                        value={insights.post.loops || 0}
                        icon={Zap}
                        color="text-amber-400"
                        bg="bg-amber-400/10"
                      />
                      <StatCard
                        label={t('modals.insights.watch_time')}
                        value={insights.post.watchTime || 0}
                        icon={TrendingUp}
                        color="text-cyan-400"
                        bg="bg-cyan-400/10"
                        formatter={(v) =>
                          v > 60 ? `${(v / 60).toFixed(1)}m` : `${v}s`
                        }
                      />
                    </>
                  ) : (
                    <>
                      <StatCard
                        label={t('modals.insights.likes')}
                        value={insights.post._count.likes}
                        icon={Heart}
                        color="text-rose-400"
                        bg="bg-rose-400/10"
                      />
                      <StatCard
                        label={t('modals.insights.comments')}
                        value={insights.post._count.comments}
                        icon={MessageCircle}
                        color="text-emerald-400"
                        bg="bg-emerald-400/10"
                      />
                    </>
                  )}
                  <StatCard
                    label={t('modals.insights.saves')}
                    value={insights.post._count.bookmarks}
                    icon={Bookmark}
                    color="text-purple-400"
                    bg="bg-purple-400/10"
                  />
                </div>

                {/* 2. Evolution Chart */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-white font-black text-xs uppercase tracking-wide flex items-center gap-2">
                      <TrendingUp size={14} className="text-brand-primary" />
                      {t('modals.insights.views_evolution')}
                    </h4>
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
                      {t('modals.insights.last_days')}
                    </span>
                  </div>

                  <div className="h-64 w-full bg-black/40 rounded-4xl border border-white/5 p-6">
                    {insights.chart.length > 0 ? (
                      <SafeResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={insights.chart}
                          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient
                              id="viewGrad"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="5%"
                                stopColor="#A855F7"
                                stopOpacity={0.3}
                              />
                              <stop
                                offset="95%"
                                stopColor="#A855F7"
                                stopOpacity={0}
                              />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke="rgba(255,255,255,0.05)"
                          />
                          <XAxis
                            dataKey="date"
                            axisLine={false}
                            tickLine={false}
                            tick={{
                              fill: '#52525b',
                              fontSize: 9,
                              fontWeight: 800,
                            }}
                            dy={10}
                          />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{
                              fill: '#52525b',
                              fontSize: 9,
                              fontWeight: 800,
                            }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#09090b',
                              border: '1px solid rgba(255,255,255,0.1)',
                              borderRadius: '12px',
                              fontSize: '10px',
                              fontWeight: 900,
                              textTransform: 'uppercase',
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="views"
                            stroke="#A855F7"
                            strokeWidth={3}
                            fill="url(#viewGrad)"
                            animationDuration={1500}
                          />
                        </AreaChart>
                      </SafeResponsiveContainer>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-2">
                        <BarChart3 size={32} strokeWidth={1.5} />
                        <p className="text-xs font-black uppercase tracking-wide">
                          {t('modals.insights.not_enough_data')}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Performance Summary */}
                <div className="bg-brand-primary/5 rounded-4xl border border-brand-primary/10 p-6 flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg bg-brand-primary/20 flex items-center justify-center shrink-0">
                    <Zap size={32} className="text-brand-primary" />
                  </div>
                  <div>
                    <h4 className="text-white font-bold mb-1">
                      {t('modals.insights.impact_summary')}
                    </h4>
                    <p className="text-zinc-500 text-sm leading-relaxed">
                      {t('modals.insights.engagement_rate_prefix')}{' '}
                      {(
                        ((insights.post._count.likes +
                          insights.post._count.comments) /
                          (insights.post.views || 1)) *
                        100
                      ).toFixed(1)}
                      %.
                      {insights.post.views > 100
                        ? t('modals.insights.above_average')
                        : t('modals.insights.keep_promoting')}
                    </p>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  bg,
  formatter,
}: {
  label: string;
  value: number;
  icon: any;
  color: string;
  bg: string;
  formatter?: (val: number) => string;
}) {
  return (
    <div className="glass-panel p-4 rounded-xl border border-white/5 space-y-3">
      <div
        className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center border border-white/5`}
      >
        <Icon size={16} className={color} />
      </div>
      <div>
        <p className="text-zinc-500 text-xs font-black uppercase tracking-wide">
          {label}
        </p>
        <p className="text-white font-black text-xl tracking-tight mt-0.5">
          {formatter ? formatter(value) : value.toLocaleString()}
        </p>
      </div>
    </div>
  );
}
