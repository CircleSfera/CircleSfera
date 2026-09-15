import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Bookmark,
  Clock,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  TrendingUp,
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
import { Dialog } from '../ui/Dialog';

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
    <Dialog isOpen onClose={onClose} maxWidth="2xl" className="max-h-[90vh]">
      <div className="-mx-4 -mt-4 flex flex-col max-h-[85vh]">
        <div className="p-6 md:p-8 border-b border-white/5 flex items-center gap-3 bg-white/2 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center border border-brand-primary/20">
            <BarChart3 size={20} className="text-brand-primary" />
          </div>
          <div className="min-w-0 pr-10">
            <h3 className="text-white font-black text-lg leading-none">
              {t('modals.insights.post_stats')}
            </h3>
            <p className="text-zinc-400 text-xs font-bold uppercase tracking-wide mt-1.5">
              {t('modals.insights.realtime_metrics')}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-4 custom-scrollbar min-h-0">
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  label={t('modals.insights.views')}
                  value={insights.post.views}
                  icon={Eye}
                  color="text-blue-400"
                  bg="bg-blue-400/10"
                />
                <StatCard
                  label={t('modals.insights.impressions')}
                  value={insights.post.impressions || 0}
                  icon={Eye}
                  color="text-indigo-400"
                  bg="bg-indigo-400/10"
                />
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
                <StatCard
                  label={t('modals.insights.saves')}
                  value={insights.post._count.bookmarks}
                  icon={Bookmark}
                  color="text-purple-400"
                  bg="bg-purple-400/10"
                />
                <StatCard
                  label={t('modals.insights.shares')}
                  value={insights.post.shares || 0}
                  icon={Share2}
                  color="text-pink-400"
                  bg="bg-pink-400/10"
                />
                <StatCard
                  label={t('modals.insights.dwell_time')}
                  value={insights.post.totalDwellTime || 0}
                  icon={Clock}
                  color="text-cyan-400"
                  bg="bg-cyan-400/10"
                  formatter={(v) =>
                    v > 60 ? `${(v / 60).toFixed(1)}m` : `${v}s`
                  }
                />
                <StatCard
                  label={t('modals.insights.conversion_rate')}
                  value={insights.post.conversionRate || 0}
                  icon={TrendingUp}
                  color="text-amber-400"
                  bg="bg-amber-400/10"
                  formatter={(v) => `${v}%`}
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-white font-black text-xs uppercase tracking-wide flex items-center gap-2">
                    <TrendingUp size={14} className="text-brand-primary" />
                    {t('modals.insights.views_evolution')}
                  </h4>
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-wide">
                    {t('modals.insights.last_days')}
                  </span>
                </div>

                <div className="h-64 w-full bg-black/40 rounded-xl border border-white/5 p-6">
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

              <div className="bg-brand-primary/5 rounded-xl border border-brand-primary/10 p-6 flex items-center gap-4">
                <div className="w-16 h-16 rounded-lg bg-brand-primary/20 flex items-center justify-center shrink-0">
                  <Zap size={32} className="text-brand-primary" />
                </div>
                <div>
                  <h4 className="text-white font-bold mb-1">
                    {t('modals.insights.impact_summary')}
                  </h4>
                  <p className="text-zinc-400 text-sm leading-relaxed">
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
      </div>
    </Dialog>
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
  icon: LucideIcon;
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
        <p className="text-zinc-400 text-xs font-black uppercase tracking-wide">
          {label}
        </p>
        <p className="text-white font-black text-xl tracking-tight mt-0.5">
          {formatter ? formatter(value) : value.toLocaleString()}
        </p>
      </div>
    </div>
  );
}
