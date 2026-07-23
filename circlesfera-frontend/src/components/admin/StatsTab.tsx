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
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();

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

  const formatAction = (action: string) =>
    t(`admin.stats.actions.${action}`, action);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <AdminPageHeader
          title={t('admin.stats.title')}
          subtitle={t('admin.stats.subtitle')}
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

  const userSparkline = chartData?.map((d) => d.users);
  const postSparkline = chartData?.map((d) => d.posts);
  const storySparkline = chartData?.map((d) => d.stories);
  const reportSparkline = chartData?.map((d) => d.reports);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t('admin.stats.title')}
        subtitle={t('admin.stats.subtitle')}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard
          label={t('admin.stats.total_users')}
          value={stats?.users || 0}
          icon={Users}
          color="blue"
          growth={stats?.userGrowth}
          sparklineData={userSparkline}
        />
        <StatCard
          label={t('admin.stats.posts')}
          value={stats?.posts || 0}
          icon={ImageIcon}
          color="purple"
          growth={stats?.postGrowth}
          sparklineData={postSparkline}
        />
        <StatCard
          label={t('admin.stats.active_stories')}
          value={stats?.stories || 0}
          icon={Clock}
          color="pink"
          sparklineData={storySparkline}
        />
        <StatCard
          label={t('admin.stats.pending_reports')}
          value={stats?.pendingReports || 0}
          icon={Flag}
          color="red"
          sparklineData={reportSparkline}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard
          label={t('admin.stats.active_today')}
          value={stats?.activeUsersToday || 0}
          icon={UserCheck}
          color="green"
        />
        <StatCard
          label={t('admin.stats.engagement_ratio')}
          value={stats?.engagement || 0}
          icon={Activity}
          color="yellow"
          subtitle={t('admin.stats.engagement_subtitle')}
          suffix="%"
          isCounter={false}
        />
        <StatCard
          label={t('admin.stats.new_this_week')}
          value={stats?.newUsersThisWeek || 0}
          icon={Users}
          color="blue"
          subtitle={t('admin.stats.new_users_subtitle')}
        />
        <StatCard
          label={t('admin.stats.reported_content')}
          value={stats?.reportedContentPercent || 0}
          icon={Percent}
          color="red"
          subtitle={t('admin.stats.reported_subtitle')}
          suffix="%"
          isCounter={false}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 glass-panel rounded-lg border border-white/5 p-3 sm:p-5">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <BarChart3 size={18} className="text-brand-primary" />
            <h3 className="text-white font-semibold text-sm">
              {t('admin.stats.activity_chart')}
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
                  labelFormatter={(v) =>
                    t('admin.stats.chart_date', { date: String(v) })
                  }
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area
                  type="monotone"
                  dataKey="posts"
                  name={t('admin.stats.chart_posts')}
                  stroke="#a855f7"
                  fill="url(#gradPosts)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="users"
                  name={t('admin.stats.chart_new_users')}
                  stroke="#3b82f6"
                  fill="url(#gradUsers)"
                  strokeWidth={2}
                />
              </AreaChart>
            </SafeResponsiveContainer>
          ) : (
            <AdminEmptyState
              icon={BarChart3}
              title={t('admin.stats.activity_empty_title')}
              description={t('admin.stats.activity_empty_description')}
              compact
            />
          )}
        </div>

        <div className="glass-panel rounded-lg border border-white/5 p-3 sm:p-5">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <UserCheck size={18} className="text-brand-primary" />
            <h3 className="text-white font-semibold text-sm">
              {t('admin.stats.top_engagement')}
            </h3>
          </div>
          {topUsers && topUsers.length > 0 ? (
            <div className="space-y-2">
              {topUsers.map((user, i) => (
                <AdminListRow
                  key={user.id}
                  title={`@${user.username}`}
                  subtitle={t('admin.stats.rank_engagement', {
                    rank: i + 1,
                    value: user.engagement,
                  })}
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
              title={t('admin.stats.top_empty_title')}
              description={t('admin.stats.top_empty_description')}
              compact
            />
          )}
        </div>
      </div>

      {stats?.recentActivity && stats.recentActivity.length > 0 && (
        <div className="glass-panel rounded-lg border border-white/5 overflow-hidden">
          <div className="px-3 sm:px-5 py-2.5 sm:py-3 border-b border-white/5 flex items-center gap-2">
            <BarChart3 size={18} className="text-brand-primary" />
            <h3 className="text-white font-semibold text-sm">
              {t('admin.stats.recent_admin_activity')}
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
