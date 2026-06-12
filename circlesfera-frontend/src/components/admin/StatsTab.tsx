import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  BarChart3,
  Clock,
  Flag,
  Heart,
  Image as ImageIcon,
  MessageCircle,
  Percent,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  ActivityChartDay,
  EnhancedStats,
  TopUser,
} from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import SafeResponsiveContainer from '../common/SafeResponsiveContainer';
import StatCard from './StatCard';

export default function StatsTab() {
  const { data: stats, isLoading } = useQuery<EnhancedStats>({
    queryKey: ['admin', 'stats', 'enhanced'],
    queryFn: () => adminApi.getEnhancedStats().then((res) => res.data),
    refetchInterval: 30_000,
  });

  const { data: chartData } = useQuery<ActivityChartDay[]>({
    queryKey: ['admin', 'stats', 'activity-chart'],
    queryFn: () => adminApi.getActivityChart().then((r) => r.data),
  });

  const { data: topUsers } = useQuery<TopUser[]>({
    queryKey: ['admin', 'stats', 'top-users'],
    queryFn: () => adminApi.getTopUsers().then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].map((id) => (
          <div
            key={id}
            className="glass-panel p-6 rounded-2xl h-32 animate-pulse bg-white/5"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Primary Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          label="Usuarios Totales"
          value={stats?.users || 0}
          icon={Users}
          color="blue"
          growth={stats?.userGrowth}
        />
        <StatCard
          label="Publicaciones"
          value={stats?.posts || 0}
          icon={ImageIcon}
          color="purple"
          growth={stats?.postGrowth}
        />
        <StatCard
          label="Historias Activas"
          value={stats?.stories || 0}
          icon={Clock}
          color="pink"
        />
        <StatCard
          label="Reportes Pendientes"
          value={stats?.pendingReports || 0}
          icon={Flag}
          color="red"
        />
      </div>

      {/* Secondary Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          label="Usuarios Activos Hoy"
          value={stats?.activeUsersToday || 0}
          icon={UserCheck}
          color="green"
        />
        <StatCard
          label="Engagement Ratio"
          value={stats?.engagement || 0}
          icon={Activity}
          color="yellow"
          subtitle="Likes + Comentarios / Post"
        />
        <StatCard
          label="Nuevos Esta Semana"
          value={stats?.newUsersThisWeek || 0}
          icon={Users}
          color="blue"
          subtitle="Usuarios registrados"
        />
        <StatCard
          label="Contenido Reportado"
          value={stats?.reportedContentPercent || 0}
          icon={Percent}
          color="red"
          subtitle="% del total de posts"
        />
      </div>

      {/* Activity Chart + Top Users */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-2 glass-panel rounded-2xl border border-white/5 p-6">
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 size={18} className="text-brand-primary" />
            <h3 className="text-white font-bold text-sm">
              Actividad (últimos 14 días)
            </h3>
          </div>
          {chartData && chartData.length > 0 ? (
            <SafeResponsiveContainer
              width="100%"
              height={260}
              wrapperHeight={260}
            >
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gradPosts" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.05)"
                />
                <XAxis
                  dataKey="date"
                  stroke="#4b5563"
                  fontSize={10}
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis stroke="#4b5563" fontSize={10} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(17,17,17,0.95)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  labelFormatter={(v) => `Fecha: ${String(v)}`}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area
                  type="monotone"
                  dataKey="posts"
                  name="Posts"
                  stroke="#a855f7"
                  fill="url(#gradPosts)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="users"
                  name="Nuevos usuarios"
                  stroke="#3b82f6"
                  fill="url(#gradUsers)"
                  strokeWidth={2}
                />
              </AreaChart>
            </SafeResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-gray-600 text-sm">
              Sin datos de actividad
            </div>
          )}
        </div>

        {/* Top Users */}
        <div className="glass-panel rounded-2xl border border-white/5 p-6">
          <div className="flex items-center gap-2 mb-6">
            <UserCheck size={18} className="text-brand-primary" />
            <h3 className="text-white font-bold text-sm">Top Engagement</h3>
          </div>
          <div className="space-y-4">
            {topUsers && topUsers.length > 0 ? (
              topUsers.map((user, i) => (
                <div key={user.id} className="flex items-center gap-3">
                  <span className="text-gray-600 font-black text-sm w-5">
                    {i + 1}
                  </span>
                  <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden shrink-0">
                    {user.avatar ? (
                      <img
                        src={user.avatar}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs font-bold">
                        {user.username[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm font-bold truncate">
                      @{user.username}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Heart size={10} className="text-pink-400" />
                        {user.totalLikes}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle size={10} className="text-blue-400" />
                        {user.totalComments}
                      </span>
                    </div>
                  </div>
                  <span className="text-brand-primary font-black text-sm">
                    {user.engagement}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-gray-600 text-sm text-center py-4">
                Sin datos
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      {stats?.recentActivity && stats.recentActivity.length > 0 && (
        <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5 flex items-center gap-2">
            <BarChart3 size={18} className="text-brand-primary" />
            <h3 className="text-white font-bold text-sm">
              Actividad Reciente del Admin
            </h3>
          </div>
          <div className="divide-y divide-white/5">
            {stats.recentActivity.map((log) => (
              <div
                key={log.id}
                className="px-6 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-brand-primary/10 flex items-center justify-center">
                    <Activity size={14} className="text-brand-primary" />
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">
                      <span className="text-brand-primary">
                        @{log.adminUsername}
                      </span>{' '}
                      <span className="text-gray-400">
                        {formatAction(log.action)}
                      </span>
                    </p>
                    <p className="text-gray-600 text-xs">
                      {log.targetType} · {log.targetId.slice(0, 8)}...
                    </p>
                  </div>
                </div>
                <span className="text-gray-600 text-xs whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatAction(action: string): string {
  const map: Record<string, string> = {
    ban_user: 'baneó un usuario',
    unban_user: 'desbaneó un usuario',
    delete_post: 'eliminó una publicación',
    delete_user: 'eliminó una cuenta',
    promote_user: 'promovió a admin',
    demote_user: 'degradó de admin',
    resolved_report: 'resolvió un reporte',
    dismissed_report: 'descartó un reporte',
  };
  return map[action] || action;
}
