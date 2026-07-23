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
import { AdminEmptyState } from './AdminEmptyState';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import StatCard from './StatCard';

export default function StatsTab() {
  const { data: stats, isLoading } = useQuery<EnhancedStats>({
    queryKey: ['admin', 'stats', 'enhanced'],
    queryFn: () => adminApi.getEnhancedStats(),
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
      <div className="space-y-4">
        <AdminPageHeader
          title="Estadísticas Globales"
          subtitle="Métricas en tiempo real y actividad del sistema"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].map((id) => (
            <div
              key={id}
              className="glass-panel p-4 rounded-xl h-28 animate-pulse bg-white/5"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Estadísticas Globales"
        subtitle="Métricas en tiempo real y actividad del sistema"
      />

      {/* Primary Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard
          label="Usuarios Totales"
          value={stats?.users || 0}
          icon={Users}
          color="blue"
          growth={stats?.userGrowth}
          sparklineData={[10, 25, 30, 45, 60, 50, 80, 95]}
        />
        <StatCard
          label="Publicaciones"
          value={stats?.posts || 0}
          icon={ImageIcon}
          color="purple"
          growth={stats?.postGrowth}
          sparklineData={[5, 10, 8, 20, 15, 30, 45, 50]}
        />
        <StatCard
          label="Historias Activas"
          value={stats?.stories || 0}
          icon={Clock}
          color="pink"
          sparklineData={[50, 40, 60, 80, 45, 90, 100, 85]}
        />
        <StatCard
          label="Reportes Pendientes"
          value={stats?.pendingReports || 0}
          icon={Flag}
          color="red"
          sparklineData={[0, 2, 5, 3, 8, 4, 1, 0]}
        />
      </div>

      {/* Secondary Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
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
          suffix="%"
          isCounter={false}
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
          suffix="%"
          isCounter={false}
        />
      </div>

      {/* Activity Chart + Top Users */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Chart */}
        <div className="lg:col-span-2 glass-panel rounded-lg border border-white/5 p-3 sm:p-5">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <BarChart3 size={18} className="text-brand-primary" />
            <h3 className="text-white font-semibold text-sm">
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
            <AdminEmptyState
              icon={BarChart3}
              title="Sin datos de actividad"
              description="No hay datos disponibles para el período seleccionado"
              compact
            />
          )}
        </div>

        {/* Top Users */}
        <div className="glass-panel rounded-lg border border-white/5 p-3 sm:p-5">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <UserCheck size={18} className="text-brand-primary" />
            <h3 className="text-white font-semibold text-sm">Top Engagement</h3>
          </div>
          {topUsers && topUsers.length > 0 ? (
            <div className="space-y-2">
              {topUsers.map((user, i) => (
                <AdminListRow
                  key={user.id}
                  title={`@${user.username}`}
                  subtitle={`#${i + 1} · engagement ${user.engagement}`}
                  meta={
                    <>
                      <span className="flex items-center gap-1">
                        <Heart size={12} className="text-pink-400" />
                        {user.totalLikes}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle size={12} className="text-blue-400" />
                        {user.totalComments}
                      </span>
                    </>
                  }
                  avatar={
                    <div className="w-9 h-9 rounded-full bg-white/10 overflow-hidden">
                      {user.avatar ? (
                        <img
                          src={user.avatar}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs font-semibold">
                          {user.username[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                  }
                  badge={
                    <span className="text-brand-primary font-semibold text-sm">
                      {user.engagement}
                    </span>
                  }
                />
              ))}
            </div>
          ) : (
            <AdminEmptyState
              icon={UserCheck}
              title="Sin datos"
              description="No hay información de usuarios disponible"
              compact
            />
          )}
        </div>
      </div>

      {/* Recent Activity */}
      {stats?.recentActivity && stats.recentActivity.length > 0 && (
        <div className="glass-panel rounded-lg border border-white/5 overflow-hidden">
          <div className="px-3 sm:px-5 py-2.5 sm:py-3 border-b border-white/5 flex items-center gap-2">
            <BarChart3 size={18} className="text-brand-primary" />
            <h3 className="text-white font-semibold text-sm">
              Actividad Reciente del Admin
            </h3>
          </div>
          <div className="divide-y divide-white/5">
            {stats.recentActivity.map((log) => (
              <div
                key={log.id}
                className="px-3 sm:px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0">
                    <Activity size={14} className="text-brand-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium">
                      <span className="text-brand-primary">
                        @{log.adminUsername}
                      </span>{' '}
                      <span className="text-gray-300">
                        {formatAction(log.action)}
                      </span>
                    </p>
                    <p className="text-gray-600 text-xs truncate">
                      {log.targetType} · {log.targetId.slice(0, 8)}...
                    </p>
                  </div>
                </div>
                <span className="text-gray-600 text-xs sm:whitespace-nowrap ml-11 sm:ml-0">
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
