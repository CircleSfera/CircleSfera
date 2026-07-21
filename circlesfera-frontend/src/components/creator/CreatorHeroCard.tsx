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
      className="relative overflow-hidden group rounded-2xl border border-white/10 bg-black/40 backdrop-blur-2xl shadow-2xl"
    >
      {/* Mesh Gradient Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-brand-primary/15 blur-[100px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] bg-brand-secondary/10 blur-[80px] rounded-full" />
      </div>

      {/* Floating Chart Background */}
      <div className="absolute inset-0 opacity-30 pointer-events-none w-full h-70 md:h-100">
        {chartData && chartData.length > 0 && (
          <SafeResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 80, right: 0, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#A855F7" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#A855F7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="views"
                stroke="#A855F7"
                strokeWidth={3}
                fill="url(#heroGrad)"
                animationDuration={1500}
              />
            </AreaChart>
          </SafeResponsiveContainer>
        )}
      </div>

      {/* Hero Content */}
      <div className="relative z-10 p-5 sm:p-7 md:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-brand-primary font-bold text-xs uppercase tracking-wider mb-2">
              <span className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
              Evolución en Vivo
            </div>
            <h2 className="text-white text-3xl sm:text-4xl font-black tracking-tight leading-none">
              {stats?.followerCount.toLocaleString() || '0'}
            </h2>
            <div className="flex items-center gap-2 pt-1">
              <p className="text-gray-400 font-bold text-xs uppercase tracking-wider">
                Seguidores Totales
              </p>
              {stats?.followerGrowth !== undefined && (
                <div
                  className={`flex items-center gap-1 px-2.5 py-0.5 border rounded-full text-xs font-black ${
                    stats.followerGrowth >= 0
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                  }`}
                >
                  <TrendingUp
                    size={11}
                    className={stats.followerGrowth < 0 ? 'rotate-180' : ''}
                  />
                  {stats.followerGrowth >= 0 ? '+' : ''}
                  {stats.followerGrowth}%
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 bg-white/5 backdrop-blur-xl p-4 sm:p-5 rounded-2xl border border-white/10 shadow-inner">
            <div className="space-y-1">
              <p className="text-gray-400 text-[10px] sm:text-xs font-black uppercase tracking-wider">
                Engagement
              </p>
              <div className="flex items-center gap-1.5">
                <Zap size={15} className="text-amber-400" />
                <span className="text-white font-black text-lg sm:text-xl tracking-tight">
                  {stats?.engagementRate || 0}%
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-gray-400 text-[10px] sm:text-xs font-black uppercase tracking-wider">
                Alcance Total
              </p>
              <div className="flex items-center gap-1.5">
                <Users size={15} className="text-brand-primary" />
                <span className="text-white font-black text-lg sm:text-xl tracking-tight">
                  {stats?.totalReach
                    ? stats.totalReach > 1000000
                      ? `${(stats.totalReach / 1000000).toFixed(1)}M`
                      : stats.totalReach.toLocaleString()
                    : '0'}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-gray-400 text-[10px] sm:text-xs font-black uppercase tracking-wider">
                MRR Mensual
              </p>
              <div className="flex items-center gap-1.5">
                <DollarSign size={15} className="text-emerald-400" />
                <span className="text-white font-black text-lg sm:text-xl tracking-tight">
                  ${stats?.mrr || 0}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-gray-400 text-[10px] sm:text-xs font-black uppercase tracking-wider">
                Suscriptores
              </p>
              <div className="flex items-center gap-1.5">
                <Award size={15} className="text-purple-400" />
                <span className="text-white font-black text-lg sm:text-xl tracking-tight">
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
