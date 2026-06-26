import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CreatorChartDay } from '../../services/creator.service';
import { creatorApi } from '../../services/creator.service';
import { exportToCSV } from '../../utils/exportUtils';
import SafeResponsiveContainer from '../common/SafeResponsiveContainer';

export default function CreatorAnalyticsTab() {
  const { t } = useTranslation();
  const { data: chartData, isLoading } = useQuery<CreatorChartDay[]>({
    queryKey: ['creator', 'activity-chart'],
    queryFn: () => creatorApi.getActivityChart().then((r) => r.data),
  });

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

        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-black text-white tracking-tight">
            {t('creator.analytics.audience_evolution')}
          </h2>
          {chartData && chartData.length > 0 && (
            <button
              type="button"
              onClick={() => exportToCSV('analytics_report.csv', chartData)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold text-gray-300 transition-colors"
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
            <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500">
              <p className="text-sm font-bold">
                {t('creator.analytics.not_enough_data')}
              </p>
              <p className="text-xs">{t('creator.analytics.upload_content')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Could add demography and referral tracking here in future */}
    </div>
  );
}
