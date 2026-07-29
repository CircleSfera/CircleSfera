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
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden group rounded-2xl border border-white/10 bg-black/60 backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
    >
      {/* Mesh Gradient Background */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-brand-primary/20 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-brand-secondary/15 blur-[100px] rounded-full mix-blend-screen" />
      </div>
      <div
        className="absolute inset-0 opacity-20 pointer-events-none z-0 mix-blend-overlay"
        style={{ backgroundImage: 'url(/noise.png)', backgroundSize: '100px' }}
      />

      {/* Floating Chart Background */}
      <div className="absolute inset-0 opacity-40 pointer-events-none w-full h-70 md:h-100 z-0">
        {chartData && chartData.length > 0 && (
          <SafeResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 80, right: 0, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-brand-primary)"
                    stopOpacity={0.6}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-brand-secondary)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="views"
                stroke="url(#heroGrad)"
                strokeWidth={3}
                fill="url(#heroGrad)"
                animationDuration={1500}
              />
            </AreaChart>
          </SafeResponsiveContainer>
        )}
      </div>

      {/* Hero Content */}
      <div className="relative z-10 p-6 sm:p-8 md:p-10">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="space-y-1.5 drop-shadow-md">
            <div className="flex items-center gap-2 text-brand-primary font-bold text-xs uppercase tracking-[0.15em] mb-3">
              <span className="w-2 h-2 rounded-full bg-brand-primary shadow-[0_0_10px_rgba(var(--brand-primary),0.8)] animate-pulse" />
              Evolución en Vivo
            </div>
            <h2 className="text-4xl sm:text-5xl font-black tracking-tighter leading-none bg-linear-to-br from-white to-white/60 bg-clip-text text-transparent">
              {stats?.followerCount.toLocaleString() || '0'}
            </h2>
            <div className="flex items-center gap-2 pt-2">
              <p className="text-gray-400 font-semibold text-xs uppercase tracking-wider">
                Seguidores Totales
              </p>
              {stats?.followerGrowth !== undefined && (
                <div
                  className={`flex items-center gap-1.5 px-3 py-1 border rounded-full text-[11px] font-bold shadow-lg ${
                    stats.followerGrowth >= 0
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-emerald-500/10'
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-400 shadow-rose-500/10'
                  }`}
                >
                  <TrendingUp
                    size={12}
                    className={stats.followerGrowth < 0 ? 'rotate-180' : ''}
                    strokeWidth={3}
                  />
                  {stats.followerGrowth >= 0 ? '+' : ''}
                  {stats.followerGrowth}%
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 bg-white/5 backdrop-blur-2xl p-5 sm:p-6 rounded-3xl border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] w-full lg:w-auto lg:min-w-[min(100%,32rem)] xl:min-w-2xl">
            <div className="space-y-1.5 p-2 rounded-xl hover:bg-white/5 transition-colors cursor-default">
              <p className="text-gray-400 text-[11px] font-bold uppercase tracking-wider">
                Engagement
              </p>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
                  <Zap size={14} className="text-amber-400" />
                </div>
                <span className="text-white font-black text-xl sm:text-2xl tracking-tight">
                  {stats?.engagementRate || 0}%
                </span>
              </div>
            </div>

            <div className="space-y-1.5 p-2 rounded-xl hover:bg-white/5 transition-colors cursor-default">
              <p className="text-gray-400 text-[11px] font-bold uppercase tracking-wider">
                Alcance
              </p>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center">
                  <Users size={14} className="text-brand-primary" />
                </div>
                <span className="text-white font-black text-xl sm:text-2xl tracking-tight">
                  {stats?.totalReach
                    ? stats.totalReach > 1000000
                      ? `${(stats.totalReach / 1000000).toFixed(1)}M`
                      : stats.totalReach.toLocaleString()
                    : '0'}
                </span>
              </div>
            </div>

            <div className="space-y-1.5 p-2 rounded-xl hover:bg-white/5 transition-colors cursor-default">
              <p className="text-gray-400 text-[11px] font-bold uppercase tracking-wider">
                MRR Mensual
              </p>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center">
                  <DollarSign size={14} className="text-emerald-400" />
                </div>
                <span className="text-white font-black text-xl sm:text-2xl tracking-tight">
                  ${stats?.mrr || 0}
                </span>
              </div>
            </div>

            <div className="space-y-1.5 p-2 rounded-xl hover:bg-white/5 transition-colors cursor-default">
              <p className="text-gray-400 text-[11px] font-bold uppercase tracking-wider">
                Suscriptores
              </p>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-brand-secondary/10 border border-brand-secondary/20 flex items-center justify-center">
                  <Award size={14} className="text-brand-secondary" />
                </div>
                <span className="text-white font-black text-xl sm:text-2xl tracking-tight">
                  {stats?.subscriberCount || 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
