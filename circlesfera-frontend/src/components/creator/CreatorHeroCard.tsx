import { motion } from 'framer-motion';
import { Award, DollarSign, TrendingUp, Users, Zap } from 'lucide-react';
import { Area, AreaChart } from 'recharts';
import type {
  CreatorChartDay,
  CreatorStats,
} from '../../services/creator.service';
import SafeResponsiveContainer from '../common/SafeResponsiveContainer';

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

export default function CreatorHeroCard({ stats, chartData }: Props) {
  const isPositiveGrowth = (stats?.followerGrowth ?? 0) >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl border border-white/8 bg-zinc-950/80 backdrop-blur-xl p-4 sm:p-6 shadow-xl"
    >
      {/* Background ambient glowing mesh */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-16 -left-16 w-64 h-64 bg-brand-primary/15 blur-[90px] rounded-full mix-blend-screen" />
        <div className="absolute -bottom-16 -right-16 w-64 h-64 bg-brand-secondary/10 blur-[90px] rounded-full mix-blend-screen" />
      </div>

      {/* Floating area chart background */}
      <div className="absolute bottom-0 left-0 right-0 h-32 sm:h-40 opacity-30 pointer-events-none z-0">
        {chartData && chartData.length > 0 && (
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
                    stopOpacity={0.7}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--color-brand-secondary)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="views"
                stroke="url(#heroGrad)"
                strokeWidth={2.5}
                fill="url(#heroGrad)"
                animationDuration={1200}
              />
            </AreaChart>
          </SafeResponsiveContainer>
        )}
      </div>

      {/* Hero Content */}
      <div className="relative z-10 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-brand-primary text-xs font-semibold uppercase tracking-wider mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
              Rendimiento en Vivo
            </div>
            <div className="flex items-baseline gap-3">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white font-mono tabular-nums">
                {stats?.followerCount.toLocaleString() || '0'}
              </h2>
              <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                Seguidores Totales
              </span>
            </div>
          </div>

          {stats?.followerGrowth !== undefined && (
            <div
              className={`self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border backdrop-blur-md ${
                isPositiveGrowth
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
              }`}
            >
              <TrendingUp
                size={14}
                className={!isPositiveGrowth ? 'rotate-180' : ''}
              />
              <span>
                {isPositiveGrowth ? '+' : ''}
                {stats.followerGrowth}% este mes
              </span>
            </div>
          )}
        </div>

        {/* Compact 4-Metric Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {/* Engagement */}
          <div className="bg-white/3 backdrop-blur-md p-3 rounded-xl border border-white/6 hover:border-white/10 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Zap size={13} />
              </div>
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Engagement
              </span>
            </div>
            <p className="text-lg sm:text-xl font-black text-white font-mono tabular-nums pl-8">
              {stats?.engagementRate || 0}%
            </p>
          </div>

          {/* Reach */}
          <div className="bg-white/3 backdrop-blur-md p-3 rounded-xl border border-white/6 hover:border-white/10 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-lg bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary">
                <Users size={13} />
              </div>
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Alcance Total
              </span>
            </div>
            <p className="text-lg sm:text-xl font-black text-white font-mono tabular-nums pl-8">
              {stats?.totalReach
                ? stats.totalReach > 1000000
                  ? `${(stats.totalReach / 1000000).toFixed(1)}M`
                  : stats.totalReach.toLocaleString()
                : '0'}
            </p>
          </div>

          {/* MRR */}
          <div className="bg-white/3 backdrop-blur-md p-3 rounded-xl border border-white/6 hover:border-white/10 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <DollarSign size={13} />
              </div>
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                MRR Est.
              </span>
            </div>
            <p className="text-lg sm:text-xl font-black text-emerald-400 font-mono tabular-nums pl-8">
              ${stats?.mrr || 0}
            </p>
          </div>

          {/* Subscribers */}
          <div className="bg-white/3 backdrop-blur-md p-3 rounded-xl border border-white/6 hover:border-white/10 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-lg bg-brand-secondary/10 border border-brand-secondary/20 flex items-center justify-center text-brand-secondary">
                <Award size={13} />
              </div>
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Suscriptores
              </span>
            </div>
            <p className="text-lg sm:text-xl font-black text-white font-mono tabular-nums pl-8">
              {stats?.subscriberCount || 0}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
