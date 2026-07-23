import { useQuery } from '@tanstack/react-query';
import { Clock, Download, MapPin, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  CreatorChartDay,
  CreatorStats,
} from '../../services/creator.service';
import { creatorApi } from '../../services/creator.service';
import { exportToCSV } from '../../utils/exportUtils';
import SafeResponsiveContainer from '../common/SafeResponsiveContainer';

export default function CreatorAnalyticsTab() {
  const { t } = useTranslation();

  const { data: chartData, isLoading: isChartLoading } = useQuery<
    CreatorChartDay[]
  >({
    queryKey: ['creator', 'activity-chart'],
    queryFn: () => creatorApi.getActivityChart().then((r) => r.data),
  });

  const { data: stats, isLoading: isStatsLoading } = useQuery<CreatorStats>({
    queryKey: ['creator', 'stats'],
    queryFn: () => creatorApi.getStats().then((r) => r.data),
  });

  const isLoading = isChartLoading || isStatsLoading;

  if (isLoading) {
    return (
      <div className="p-6 bg-surface-elevated rounded-xl border border-white/5 animate-pulse min-h-[400px]">
        <div className="h-6 w-48 bg-white/10 rounded-md mb-8" />
        <div className="h-[300px] bg-white/5 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-6 bg-surface-elevated rounded-xl border border-white/5 relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-brand-primary/10 blur-[100px] rounded-full pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 sm:mb-8">
          <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
            {t('creator.analytics.audience_evolution')}
          </h2>
          {chartData && chartData.length > 0 && (
            <button
              type="button"
              onClick={() => exportToCSV('analytics_report.csv', chartData)}
              className="inline-flex items-center justify-center gap-2 min-h-11 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-semibold text-gray-300 transition-colors w-full sm:w-auto"
            >
              <Download size={14} />
              Exportar CSV
            </button>
          )}
        </div>

        <div className="h-[300px] w-full">
          {chartData && chartData.length > 0 ? (
            <SafeResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient
                    id="colorFollowers"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#ffffff"
                  strokeOpacity={0.05}
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  stroke="#ffffff"
                  strokeOpacity={0.3}
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                  tickFormatter={(val) => {
                    const date = new Date(val);
                    return date.toLocaleDateString('es-ES', {
                      day: 'numeric',
                      month: 'short',
                    });
                  }}
                />
                <YAxis
                  stroke="#ffffff"
                  strokeOpacity={0.3}
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  dx={-10}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                  }}
                  itemStyle={{ fontSize: '12px', fontWeight: 600 }}
                  labelStyle={{
                    color: '#a1a1aa',
                    fontSize: '11px',
                    marginBottom: '4px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="views"
                  name={t('creator.analytics.views')}
                  stroke="#2563eb"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorViews)"
                />
                <Area
                  type="monotone"
                  dataKey="followers"
                  name={t('creator.analytics.followers')}
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorFollowers)"
                />
              </AreaChart>
            </SafeResponsiveContainer>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400">
              <p className="text-sm font-bold">
                {t('creator.analytics.not_enough_data')}
              </p>
              <p className="text-xs">{t('creator.analytics.upload_content')}</p>
            </div>
          )}
        </div>
      </div>

      {/* 2. Demographics, Activity Hours, and Retention Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Geographic Distribution */}
        <div className="p-6 bg-surface-elevated rounded-xl border border-white/5 relative overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 mb-6">
            <MapPin size={16} className="text-brand-secondary" />
            <h3 className="text-sm font-semibold text-white tracking-wide">
              {t(
                'creator.analytics.follower_locations',
                'Geografía de Seguidores',
              )}
            </h3>
          </div>
          <div className="h-[240px] w-full flex-1">
            {stats?.geoDistribution && stats.geoDistribution.length > 0 ? (
              <SafeResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.geoDistribution} layout="vertical">
                  <CartesianGrid
                    strokeDasharray="3 3"
                    strokeOpacity={0.05}
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    stroke="#ffffff"
                    strokeOpacity={0.3}
                    fontSize={10}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    dataKey="location"
                    type="category"
                    stroke="#ffffff"
                    strokeOpacity={0.5}
                    fontSize={10}
                    axisLine={false}
                    tickLine={false}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      borderColor: 'rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                    }}
                    itemStyle={{ fontSize: '12px', color: '#fff' }}
                  />
                  <Bar
                    dataKey="count"
                    fill="#A855F7"
                    radius={[0, 4, 4, 0]}
                    barSize={16}
                  />
                </BarChart>
              </SafeResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs font-bold">
                {t(
                  'creator.analytics.no_location_data',
                  'No hay datos de ubicación',
                )}
              </div>
            )}
          </div>
        </div>

        {/* Subscriber Retention */}
        <div className="p-6 bg-surface-elevated rounded-xl border border-white/5 relative overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 mb-6">
            <Users size={16} className="text-brand-primary" />
            <h3 className="text-sm font-semibold text-white tracking-wide">
              {t(
                'creator.analytics.sub_retention',
                'Retención de Suscripciones',
              )}
            </h3>
          </div>
          <div className="h-[240px] w-full flex-1 flex flex-col md:flex-row items-center justify-around gap-4">
            {stats?.retentionStatus &&
            (stats.retentionStatus.active > 0 ||
              stats.retentionStatus.churning > 0 ||
              stats.retentionStatus.churned > 0) ? (
              <>
                <div className="h-[180px] w-[180px] shrink-0">
                  <SafeResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          {
                            name: t(
                              'creator.analytics.retained',
                              'Activas (Renovando)',
                            ),
                            value: stats.retentionStatus.active,
                          },
                          {
                            name: t(
                              'creator.analytics.churning',
                              'Canceladas (Por Expirar)',
                            ),
                            value: stats.retentionStatus.churning,
                          },
                          {
                            name: t('creator.analytics.churned', 'Expiradas'),
                            value: stats.retentionStatus.churned,
                          },
                        ].filter((d) => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        <Cell fill="#10b981" />
                        <Cell fill="#f59e0b" />
                        <Cell fill="#ef4444" />
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#18181b',
                          borderColor: 'rgba(255,255,255,0.1)',
                          borderRadius: '12px',
                        }}
                        itemStyle={{ fontSize: '11px', color: '#fff' }}
                      />
                    </PieChart>
                  </SafeResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-zinc-400 font-medium">
                      {t('creator.analytics.retained', 'Activas (Renovando)')}:
                    </span>
                    <span className="text-white font-bold">
                      {stats.retentionStatus.active}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <span className="text-zinc-400 font-medium">
                      {t(
                        'creator.analytics.churning',
                        'Canceladas (Por Expirar)',
                      )}
                      :
                    </span>
                    <span className="text-white font-bold">
                      {stats.retentionStatus.churning}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                    <span className="text-zinc-400 font-medium">
                      {t('creator.analytics.churned', 'Expiradas')}:
                    </span>
                    <span className="text-white font-bold">
                      {stats.retentionStatus.churned}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs font-bold">
                {t(
                  'creator.analytics.no_retention_data',
                  'No hay datos de suscriptores',
                )}
              </div>
            )}
          </div>
        </div>

        {/* Activity Hours */}
        <div className="p-6 bg-surface-elevated rounded-xl border border-white/5 relative overflow-hidden md:col-span-2 flex flex-col">
          <div className="flex items-center gap-2 mb-6">
            <Clock size={16} className="text-amber-500" />
            <h3 className="text-sm font-semibold text-white tracking-wide">
              {t(
                'creator.analytics.activity_hours',
                'Horas de Mayor Actividad (Últimos 30 días)',
              )}
            </h3>
          </div>
          <div className="h-[240px] w-full flex-1">
            {stats?.activityHours && stats.activityHours.length > 0 ? (
              <SafeResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.activityHours}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    strokeOpacity={0.05}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="hour"
                    stroke="#ffffff"
                    strokeOpacity={0.3}
                    fontSize={10}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => `${val}:00`}
                  />
                  <YAxis
                    stroke="#ffffff"
                    strokeOpacity={0.3}
                    fontSize={10}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      borderColor: 'rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                    }}
                    itemStyle={{ fontSize: '12px', color: '#fff' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </SafeResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xs font-bold">
                {t(
                  'creator.analytics.no_activity_data',
                  'No hay datos de actividad',
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
