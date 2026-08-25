import { useQuery } from '@tanstack/react-query';
import { Clock, DollarSign, Download, MapPin, Users } from 'lucide-react';
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
import { monetizationApi } from '../../services/monetization.service';
import { exportToCSV } from '../../utils/exportUtils';
import SafeResponsiveContainer from '../common/SafeResponsiveContainer';
import { Card } from '../ui';
import { CreatorAnalyticsDashboard } from './CreatorAnalyticsDashboard';

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

  const { data: incomeStats, isLoading: isIncomeLoading } = useQuery({
    queryKey: ['creator', 'income-stats'],
    queryFn: () => monetizationApi.getIncomeStats(),
  });

  const { data: financialSummary, isLoading: isFinancialLoading } = useQuery({
    queryKey: ['creator', 'financial-summary'],
    queryFn: () => monetizationApi.getFinancialSummary(),
  });

  const isLoading =
    isChartLoading || isStatsLoading || isIncomeLoading || isFinancialLoading;

  if (isLoading) {
    return (
      <div className="p-5 rounded-xl border border-white/5 glass-panel animate-pulse min-h-100">
        <div className="h-6 w-48 bg-white/10 rounded-md mb-8" />
        <div className="h-75 bg-white/5 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card variant="glass" className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 sm:mb-8">
          <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
            {t('creator.analytics.audience_evolution')}
          </h2>
          {chartData && chartData.length > 0 && (
            <button
              type="button"
              onClick={() => exportToCSV('analytics_report.csv', chartData)}
              className="inline-flex items-center justify-center gap-2 min-h-11 px-3 py-1.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors w-full sm:w-auto"
            >
              <Download size={14} />
              {t('creator.analytics.export_csv', 'Export CSV')}
            </button>
          )}
        </div>

        <div className="h-75 w-full mt-2">
          {chartData && chartData.length > 0 ? (
            <SafeResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-brand-primary)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-brand-primary)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                  <linearGradient
                    id="colorFollowers"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="var(--color-brand-accent)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-brand-accent)"
                      stopOpacity={0}
                    />
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
                  stroke="var(--color-brand-primary)"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorViews)"
                />
                <Area
                  type="monotone"
                  dataKey="followers"
                  name={t('creator.analytics.followers')}
                  stroke="var(--color-brand-accent)"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorFollowers)"
                />
              </AreaChart>
            </SafeResponsiveContainer>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-white/50">
              <p className="text-sm font-medium">
                {t('creator.analytics.not_enough_data')}
              </p>
              <p className="text-xs mt-1">
                {t('creator.analytics.upload_content')}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* 1.5. Financials (Income & Summary) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Income Chart */}
        <Card variant="glass" className="p-5 lg:col-span-2 flex flex-col">
          <div className="flex items-center gap-2 mb-6">
            <DollarSign size={16} className="text-brand-primary" />
            <h3 className="text-sm font-medium text-white">
              {t(
                'creator.analytics.income_history',
                'Income history (6 months)',
              )}
            </h3>
          </div>
          <div className="h-60 w-full flex-1">
            {incomeStats && incomeStats.length > 0 ? (
              <SafeResponsiveContainer width="100%" height="100%">
                <AreaChart data={incomeStats}>
                  <defs>
                    <linearGradient
                      id="incomeGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="var(--color-brand-primary)"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--color-brand-primary)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    strokeOpacity={0.05}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="month"
                    stroke="#ffffff"
                    strokeOpacity={0.3}
                    fontSize={10}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#ffffff"
                    strokeOpacity={0.3}
                    fontSize={10}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => `€${(val / 100).toFixed(0)}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      borderColor: 'rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                    }}
                    itemStyle={{ fontSize: '12px', color: '#fff' }}
                    formatter={(value: any) => [
                      `€${(Number(value) / 100).toFixed(2)}`,
                      'Ingresos',
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="income"
                    stroke="var(--color-brand-primary)"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#incomeGradient)"
                  />
                </AreaChart>
              </SafeResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm text-white/50">
                {t(
                  'creator.analytics.no_income_data',
                  'No hay datos de ingresos en este periodo',
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Financial KPIs */}
        <div className="flex flex-col gap-4">
          <Card
            variant="glass"
            className="p-5 flex-1 flex flex-col justify-center"
          >
            <h3 className="text-xs text-white/50 mb-2">
              {t('creator.analytics.current_month_income', 'Income this month')}
            </h3>
            <div className="text-3xl font-semibold text-white tracking-tight tabular-nums">
              €{((financialSummary?.currentMonthIncome || 0) / 100).toFixed(2)}
            </div>
          </Card>
          <Card
            variant="glass"
            className="p-5 flex-1 flex flex-col justify-center"
          >
            <h3 className="text-xs text-white/50 mb-2">
              {t('creator.analytics.total_tips', 'Total tips')}
            </h3>
            <div className="text-3xl font-semibold text-white tracking-tight tabular-nums">
              €{((financialSummary?.totalTips || 0) / 100).toFixed(2)}
            </div>
          </Card>
        </div>
      </div>

      {/* 2. Demographics, Activity Hours, and Retention Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Geographic Distribution */}
        <Card variant="glass" className="p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-6">
            <MapPin size={16} className="text-brand-secondary" />
            <h3 className="text-sm font-medium text-white">
              {t(
                'creator.analytics.follower_locations',
                'Geografía de Seguidores',
              )}
            </h3>
          </div>
          <div className="h-60 w-full flex-1">
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
                    fill="var(--color-brand-primary)"
                    radius={[0, 4, 4, 0]}
                    barSize={16}
                  />
                </BarChart>
              </SafeResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm text-white/50">
                {t(
                  'creator.analytics.no_location_data',
                  'No hay datos de ubicación',
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Subscriber Retention */}
        <Card variant="glass" className="p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-6">
            <Users size={16} className="text-brand-primary" />
            <h3 className="text-sm font-medium text-white">
              {t(
                'creator.analytics.sub_retention',
                'Retención de Suscripciones',
              )}
            </h3>
          </div>
          <div className="h-60 w-full flex-1 flex flex-col md:flex-row items-center justify-around gap-4">
            {stats?.retentionStatus &&
            (stats.retentionStatus.active > 0 ||
              stats.retentionStatus.churning > 0 ||
              stats.retentionStatus.churned > 0) ? (
              <>
                <div className="h-45 w-45 shrink-0">
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
                        <Cell fill="var(--color-brand-primary)" />
                        <Cell fill="var(--color-brand-accent)" />
                        <Cell fill="var(--color-brand-secondary)" />
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
                    <div className="w-2.5 h-2.5 rounded-full bg-brand-primary" />
                    <span className="text-white/50 font-medium">
                      {t('creator.analytics.retained', 'Activas (Renovando)')}:
                    </span>
                    <span className="text-white font-bold">
                      {stats.retentionStatus.active}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-brand-accent" />
                    <span className="text-white/50 font-medium">
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
                    <div className="w-2.5 h-2.5 rounded-full bg-brand-secondary" />
                    <span className="text-white/50 font-medium">
                      {t('creator.analytics.churned', 'Expiradas')}:
                    </span>
                    <span className="text-white font-bold">
                      {stats.retentionStatus.churned}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm text-white/50">
                {t(
                  'creator.analytics.no_retention_data',
                  'No hay datos de suscriptores',
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Activity Hours */}
        <Card variant="glass" className="p-5 md:col-span-2 flex flex-col">
          <div className="flex items-center gap-2 mb-6">
            <Clock size={16} className="text-brand-primary" />
            <h3 className="text-sm font-medium text-white">
              {t(
                'creator.analytics.activity_hours',
                'Horas de Mayor Actividad (Últimos 30 días)',
              )}
            </h3>
          </div>
          <div className="h-60 w-full flex-1">
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
                    stroke="var(--color-brand-primary)"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </SafeResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm text-white/50">
                {t(
                  'creator.analytics.no_activity_data',
                  'No hay datos de actividad',
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      <CreatorAnalyticsDashboard />
    </div>
  );
}
