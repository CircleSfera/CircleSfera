import {
  AlertCircle,
  Award,
  BarChart3,
  Clock,
  DollarSign,
  Download,
  Eye,
  Heart,
  Loader2,
  MessageCircle,
  Sparkles,
  Users,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { creatorApi } from '../../services/creator.service';
import { logger } from '../../utils/logger';

interface RevenueData {
  period: string;
  grossRevenue: number;
  subscriptionsTotal: number;
  tipsTotal: number;
  postUnlocksTotal: number;
  giftsTotal: number;
  activeSubscribersCount: number;
  totalFollowersCount: number;
  conversionRate: number;
  currency: string;
}

interface RetentionData {
  avgDwellSeconds: number;
  totalInteractionsSampled: number;
  peakActivityHourUTC: number;
  hourlyDistribution: number[];
}

interface TopPost {
  id: string;
  caption: string | null;
  views: number;
  performanceScore: number;
  likes: number;
  comments: number;
  bookmarks: number;
  thumbnailUrl: string | null;
  createdAt: string;
}

export const CreatorAnalyticsDashboard: React.FC = () => {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  const [loading, setLoading] = useState(true);
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [retention, setRetention] = useState<RetentionData | null>(null);
  const [topPosts, setTopPosts] = useState<TopPost[]>([]);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [revRes, retRes, topRes] = await Promise.all([
        creatorApi.getRevenueAnalytics(period),
        creatorApi.getAudienceRetentionAnalytics(),
        creatorApi.getTopPerformingContent(5),
      ]);
      setRevenue(revRes.data);
      setRetention(retRes.data);
      setTopPosts(topRes.data);
    } catch (err) {
      logger.error('Failed to fetch creator analytics:', err);
      setError('No se pudieron cargar las analíticas avanzadas.');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleExportCsv = async () => {
    try {
      setDownloadingCsv(true);
      const res = await creatorApi.exportAnalyticsCsv(period);
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `circlesfera-creator-report-${period}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      logger.error('Failed to export analytics CSV:', err);
    } finally {
      setDownloadingCsv(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-white/5 border border-white/5 rounded-2xl">
        <div>
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-accent-blue" />
            <h2 className="text-lg font-bold text-white tracking-tight">
              Analíticas Avanzadas & Ingresos
            </h2>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Rendimiento financiero, conversión de suscriptores y retención de
            audiencia
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Period selector */}
          <div className="flex items-center p-1 bg-black/40 border border-white/10 rounded-xl">
            {(['7d', '30d', '90d', '1y'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  period === p
                    ? 'bg-accent-blue text-white shadow-lg'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {p === '7d'
                  ? '7D'
                  : p === '30d'
                    ? '30D'
                    : p === '90d'
                      ? '90D'
                      : '1A'}
              </button>
            ))}
          </div>

          {/* Export CSV Button */}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={downloadingCsv || loading}
            className="flex items-center space-x-2 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-xl transition-all disabled:opacity-50"
          >
            {downloadingCsv ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">Exportar CSV</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center space-x-2 p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-12 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-3 text-accent-blue" />
          <span className="text-sm font-medium">
            Cargando métricas de creador...
          </span>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Gross Revenue */}
            <div className="p-4 bg-linear-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/20 rounded-2xl">
              <div className="flex items-center justify-between text-emerald-400 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Ingresos Brutos
                </span>
                <DollarSign className="w-5 h-5" />
              </div>
              <p className="text-2xl font-black text-white">
                €{(revenue?.grossRevenue || 0).toFixed(2)}
              </p>
              <p className="text-[11px] text-emerald-400/80 mt-1 font-medium">
                Período: {period}
              </p>
            </div>

            {/* Active Subscribers */}
            <div className="p-4 bg-linear-to-br from-accent-blue/10 to-indigo-500/5 border border-accent-blue/20 rounded-2xl">
              <div className="flex items-center justify-between text-accent-blue mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Suscriptores de Pago
                </span>
                <Users className="w-5 h-5" />
              </div>
              <p className="text-2xl font-black text-white">
                {revenue?.activeSubscribersCount || 0}
              </p>
              <p className="text-[11px] text-accent-blue/80 mt-1 font-medium">
                Tasa Conversión: {revenue?.conversionRate || 0}%
              </p>
            </div>

            {/* Avg Dwell Time */}
            <div className="p-4 bg-linear-to-br from-purple-500/10 to-pink-500/5 border border-purple-500/20 rounded-2xl">
              <div className="flex items-center justify-between text-purple-400 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Dwell Time Medio
                </span>
                <Clock className="w-5 h-5" />
              </div>
              <p className="text-2xl font-black text-white">
                {retention?.avgDwellSeconds || 0}s
              </p>
              <p className="text-[11px] text-purple-400/80 mt-1 font-medium">
                Hora pico: {retention?.peakActivityHourUTC}:00 UTC
              </p>
            </div>

            {/* Propinas y Regalos */}
            <div className="p-4 bg-linear-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/20 rounded-2xl">
              <div className="flex items-center justify-between text-amber-400 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Propinas & Regalos
                </span>
                <Sparkles className="w-5 h-5" />
              </div>
              <p className="text-2xl font-black text-white">
                €
                {(
                  (revenue?.tipsTotal || 0) + (revenue?.giftsTotal || 0)
                ).toFixed(2)}
              </p>
              <p className="text-[11px] text-amber-400/80 mt-1 font-medium">
                Directos & Mensajes Directos
              </p>
            </div>
          </div>

          {/* Revenue Breakdown & Activity Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Breakdown Card */}
            <div className="p-5 bg-white/5 border border-white/5 rounded-2xl space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <span>Desglose de Fuentes de Ingresos</span>
              </h3>

              <div className="space-y-3">
                {/* Subscriptions */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-gray-300">
                      Suscripciones Mensuales
                    </span>
                    <span className="text-white font-bold">
                      €{(revenue?.subscriptionsTotal || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent-blue rounded-full"
                      style={{
                        width: `${revenue?.grossRevenue ? (revenue.subscriptionsTotal / revenue.grossRevenue) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Post Unlocks */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-gray-300">
                      Desbloqueo de Posts de Pago
                    </span>
                    <span className="text-white font-bold">
                      €{(revenue?.postUnlocksTotal || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full"
                      style={{
                        width: `${revenue?.grossRevenue ? (revenue.postUnlocksTotal / revenue.grossRevenue) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Tips & Gifts */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-gray-300">
                      Propinas & Regalos Virtuales
                    </span>
                    <span className="text-white font-bold">
                      €
                      {(
                        (revenue?.tipsTotal || 0) + (revenue?.giftsTotal || 0)
                      ).toFixed(2)}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full"
                      style={{
                        width: `${revenue?.grossRevenue ? (((revenue.tipsTotal || 0) + (revenue.giftsTotal || 0)) / revenue.grossRevenue) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Audience Peak Activity Heatmap Preview */}
            <div className="p-5 bg-white/5 border border-white/5 rounded-2xl space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Clock className="w-4 h-4 text-purple-400" />
                <span>Distribución Horaria de Interacción (UTC)</span>
              </h3>

              <div className="grid grid-cols-12 gap-1.5 pt-2">
                {Array.from({ length: 24 }, (_, hour) => ({
                  hour,
                  count: retention?.hourlyDistribution[hour] || 0,
                })).map((slot) => {
                  const max = Math.max(
                    ...(retention?.hourlyDistribution || [1]),
                    1,
                  );
                  const intensity = Math.min(
                    Math.round((slot.count / max) * 100),
                    100,
                  );

                  return (
                    <div
                      key={`hour-slot-${slot.hour}`}
                      title={`Hora ${slot.hour}:00 UTC - ${slot.count} interacciones`}
                      className="h-10 rounded-md flex flex-col justify-end p-1 transition-all hover:scale-105 cursor-pointer"
                      style={{
                        backgroundColor: `rgba(99, 102, 241, ${Math.max(intensity / 100, 0.1)})`,
                      }}
                    >
                      <span className="text-[9px] text-gray-300 font-bold text-center">
                        {slot.hour}h
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 italic">
                Sugerencia: Publicar alrededor de las{' '}
                {retention?.peakActivityHourUTC}:00 UTC maximizará el dwell time
                y alcance de tus posts.
              </p>
            </div>
          </div>

          {/* Top Performing Posts Ranking */}
          <div className="p-5 bg-white/5 border border-white/5 rounded-2xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Award className="w-4 h-4 text-amber-400" />
              <span>
                Publicaciones con Mayor Rendimiento (Performance Score)
              </span>
            </h3>

            {topPosts.length === 0 ? (
              <p className="text-xs text-gray-400 italic py-2">
                Aún no tienes publicaciones con métricas calculadas.
              </p>
            ) : (
              <div className="space-y-3">
                {topPosts.map((post, idx) => (
                  <div
                    key={post.id}
                    className="flex items-center justify-between p-3 bg-white/5 hover:bg-white/8 border border-white/5 rounded-xl transition-all"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-black text-xs">
                        #{idx + 1}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white line-clamp-1">
                          {post.caption || 'Publicación sin texto'}
                        </p>
                        <div className="flex items-center space-x-3 text-[11px] text-gray-400 mt-0.5">
                          <span className="flex items-center space-x-1">
                            <Eye className="w-3 h-3 text-accent-blue" />
                            <span>{post.views}</span>
                          </span>
                          <span className="flex items-center space-x-1">
                            <Heart className="w-3 h-3 text-red-400" />
                            <span>{post.likes}</span>
                          </span>
                          <span className="flex items-center space-x-1">
                            <MessageCircle className="w-3 h-3 text-emerald-400" />
                            <span>{post.comments}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="px-2.5 py-1 bg-accent-blue/10 border border-accent-blue/20 text-accent-blue text-xs font-black rounded-lg">
                        Score: {post.performanceScore.toFixed(1)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
