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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden group rounded-lg border border-white/5 glass-panel"
    >
      {/* ─── Mesh Gradient Background ──────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-brand-primary/10 blur-[100px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] bg-brand-secondary/5 blur-[80px] rounded-full" />
      </div>

      {/* ─── Floating Chart Background ─────────────────────────────── */}
      <div className="absolute inset-0 opacity-40 pointer-events-none w-full h-[300px] md:h-[450px]">
        {chartData && chartData.length > 0 && (
          <SafeResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 100, right: 0, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#A855F7" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#A855F7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="views"
                stroke="#A855F7"
                strokeWidth={4}
                fill="url(#heroGrad)"
                animationDuration={2000}
              />
            </AreaChart>
          </SafeResponsiveContainer>
        )}
      </div>

      {/* ─── Content ────────────────────────────────────────────────── */}
      <div className="relative z-10 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mt-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-brand-primary font-bold text-xs uppercase tracking-wide mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse" />
              Live Evolution
            </div>
            <h2 className="text-white text-2xl md:text-3xl font-black tracking-tight leading-none">
              {stats?.followerCount.toLocaleString() || '0'}
            </h2>
            <div className="flex items-center gap-2">
              <p className="text-zinc-400 font-bold text-sm uppercase tracking-wide">
                Total Followers
              </p>
              {stats?.followerGrowth !== undefined && (
                <div
                  className={`flex items-center gap-1 px-2 py-0.5 border rounded-lg text-xs font-black ${
                    stats.followerGrowth >= 0
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                  }`}
                >
                  <TrendingUp
                    size={10}
                    className={stats.followerGrowth < 0 ? 'rotate-180' : ''}
                  />
                  {stats.followerGrowth >= 0 ? '+' : ''}
                  {stats.followerGrowth}%
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 bg-white/5 backdrop-blur-md p-5 rounded-xl border border-white/5">
            <div>
              <p className="text-zinc-500 text-xs font-black uppercase tracking-wide mb-1 italic">
                Engagement
              </p>
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-amber-400" />
                <span className="text-white font-black text-xl tracking-tight">
                  {stats?.engagementRate || 0}%
                </span>
              </div>
            </div>
            <div>
              <p className="text-zinc-500 text-xs font-black uppercase tracking-wide mb-1 italic">
                Total Reach
              </p>
              <div className="flex items-center gap-2">
                <Users size={14} className="text-brand-primary" />
                <span className="text-white font-black text-xl tracking-tight">
                  {stats?.totalReach
                    ? stats.totalReach > 1000000
                      ? `${(stats.totalReach / 1000000).toFixed(1)}M`
                      : stats.totalReach.toLocaleString()
                    : '0'}
                </span>
              </div>
            </div>
            <div>
              <p className="text-zinc-500 text-xs font-black uppercase tracking-wide mb-1 italic">
                Monthly MRR
              </p>
              <div className="flex items-center gap-2">
                <DollarSign size={14} className="text-emerald-400" />
                <span className="text-white font-black text-xl tracking-tight">
                  ${stats?.mrr || 0}
                </span>
              </div>
            </div>
            <div>
              <p className="text-zinc-500 text-xs font-black uppercase tracking-wide mb-1 italic">
                Active Subs
              </p>
              <div className="flex items-center gap-2">
                <Award size={14} className="text-purple-400" />
                <span className="text-white font-black text-xl tracking-tight">
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
