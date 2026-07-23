import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Database,
  Loader2,
  RefreshCw,
  Server,
  Webhook,
} from 'lucide-react';
import { adminApi } from '../../services/admin.service';
import { Button } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminPageHeader } from './AdminPageHeader';

export default function SystemHealthTab() {
  const {
    data: health,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['systemHealth'],
    queryFn: adminApi.getSystemHealth,
    refetchInterval: 30000, // auto refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="animate-spin text-brand-primary" size={32} />
        <p className="text-sm font-bold text-zinc-400 uppercase tracking-wide">
          Analizando infraestructura...
        </p>
      </div>
    );
  }

  if (isError || !health) {
    return (
      <AdminEmptyState
        icon={AlertTriangle}
        title="Error Crítico de Monitoreo"
        description="No se ha podido conectar con el servicio de monitoreo de infraestructura de CircleSfera."
        className="bg-red-500/10 border-red-500/20"
        action={
          <Button
            variant="danger"
            onClick={() => refetch()}
            className="uppercase tracking-wide text-xs min-h-11"
          >
            <RefreshCw size={16} className="mr-2" />
            Reintentar Conexión
          </Button>
        }
      />
    );
  }

  const isDbHealthy =
    health.database.status === 'ONLINE' && health.database.latencyMs < 150;
  const dbColor = isDbHealthy ? 'text-emerald-400' : 'text-red-400';
  const dbBg = isDbHealthy ? 'bg-emerald-500/10' : 'bg-red-500/10';
  const dbBorder = isDbHealthy ? 'border-emerald-500/20' : 'border-red-500/20';

  const isAiQueueHealthy =
    health.queues.ai.failed === 0 && health.queues.ai.wait < 50;
  const isAnalyticsQueueHealthy =
    health.queues.analytics.failed === 0 && health.queues.analytics.wait < 100;

  const webhookSuccessRate =
    health.webhooks.processed24h + health.webhooks.failed24h === 0
      ? 100
      : (health.webhooks.processed24h /
          (health.webhooks.processed24h + health.webhooks.failed24h)) *
        100;

  return (
    <div className="space-y-4 pb-20">
      <AdminPageHeader
        title="Estado del Sistema"
        subtitle={`God View de Infraestructura · Última actualización: ${new Date(health.timestamp).toLocaleTimeString()}`}
        actions={
          <Button
            variant="secondary"
            size="icon"
            onClick={() => refetch()}
            isLoading={isRefetching}
            className="text-gray-300 hover:text-white min-h-11 min-w-11"
          >
            <RefreshCw size={20} />
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* PostgreSQL Database */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-6 rounded-lg border ${dbBorder} ${dbBg} relative overflow-hidden`}
        >
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${dbColor} bg-black/20`}
              >
                <Database size={20} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white uppercase tracking-wide">
                  Base de Datos
                </h3>
                <p className="text-xs font-mono text-zinc-400">
                  PostgreSQL Prisma
                </p>
              </div>
            </div>
            {isDbHealthy ? (
              <CheckCircle2 size={24} className="text-emerald-400" />
            ) : (
              <AlertCircle size={24} className="text-red-400" />
            )}
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wide">
                Estado
              </span>
              <span className={`text-xl font-semibold ${dbColor}`}>
                {health.database.status}
              </span>
            </div>
            <div className="w-full h-px bg-white/5" />
            <div className="flex justify-between items-end">
              <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wide">
                Latencia Raw
              </span>
              <span className="text-xl font-semibold text-white font-mono">
                {health.database.latencyMs}{' '}
                <span className="text-xs text-zinc-400">ms</span>
              </span>
            </div>
          </div>
        </motion.div>

        {/* AI Processing BullMQ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`p-6 rounded-lg border ${isAiQueueHealthy ? 'border-indigo-500/20 bg-indigo-500/10' : 'border-amber-500/20 bg-amber-500/10'} relative overflow-hidden`}
        >
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${isAiQueueHealthy ? 'text-indigo-400' : 'text-amber-400'} bg-black/20`}
              >
                <BrainCircuit size={20} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white uppercase tracking-wide">
                  Cola IA
                </h3>
                <p className="text-xs font-mono text-zinc-400">
                  Moderación & Vector
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-black/20 rounded-xl p-3">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">
                En Cola
              </p>
              <p className="text-xl font-semibold text-white font-mono">
                {health.queues.ai.wait}
              </p>
            </div>
            <div className="bg-black/20 rounded-xl p-3 border border-red-500/20">
              <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-1">
                Fallidos
              </p>
              <p className="text-xl font-semibold text-red-400 font-mono">
                {health.queues.ai.failed}
              </p>
            </div>
            <div className="bg-black/20 rounded-xl p-3">
              <p className="text-xs font-semibold text-emerald-500 uppercase tracking-wide mb-1">
                Completados
              </p>
              <p className="text-xl font-semibold text-emerald-400 font-mono">
                {health.queues.ai.completed}
              </p>
            </div>
            <div className="bg-black/20 rounded-xl p-3">
              <p className="text-xs font-semibold text-brand-primary uppercase tracking-wide mb-1">
                Activos
              </p>
              <p className="text-xl font-semibold text-white font-mono">
                {health.queues.ai.active}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Analytics Processing BullMQ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={`p-6 rounded-lg border ${isAnalyticsQueueHealthy ? 'border-brand-primary/20 bg-brand-primary/10' : 'border-amber-500/20 bg-amber-500/10'} relative overflow-hidden`}
        >
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${isAnalyticsQueueHealthy ? 'text-brand-primary' : 'text-amber-400'} bg-black/20`}
              >
                <Server size={20} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white uppercase tracking-wide">
                  Cola Analytics
                </h3>
                <p className="text-xs font-mono text-zinc-400">
                  Métricas & Cron
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-black/20 rounded-xl p-3">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">
                En Cola
              </p>
              <p className="text-xl font-semibold text-white font-mono">
                {health.queues.analytics.wait}
              </p>
            </div>
            <div className="bg-black/20 rounded-xl p-3 border border-red-500/20">
              <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-1">
                Fallidos
              </p>
              <p className="text-xl font-semibold text-red-400 font-mono">
                {health.queues.analytics.failed}
              </p>
            </div>
            <div className="bg-black/20 rounded-xl p-3">
              <p className="text-xs font-semibold text-emerald-500 uppercase tracking-wide mb-1">
                Completados
              </p>
              <p className="text-xl font-semibold text-emerald-400 font-mono">
                {health.queues.analytics.completed}
              </p>
            </div>
            <div className="bg-black/20 rounded-xl p-3">
              <p className="text-xs font-semibold text-brand-primary uppercase tracking-wide mb-1">
                Activos
              </p>
              <p className="text-xl font-semibold text-white font-mono">
                {health.queues.analytics.active}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Stripe Webhooks Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="col-span-full p-6 rounded-lg glass-panel border border-white/5 relative overflow-hidden flex flex-col md:flex-row items-center gap-8"
        >
          <div className="flex items-center gap-4 md:w-1/3">
            <div className="w-16 h-16 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white shadow-xl">
              <Webhook size={32} />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-white uppercase tracking-wide">
                Stripe Webhooks
              </h3>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mt-1">
                Sincronización (Últimas 24h)
              </p>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 w-full">
            <div className="bg-black/30 rounded-xl p-4 border border-white/5">
              <p className="text-xs font-semibold text-emerald-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                <CheckCircle2 size={12} /> Procesados Exitosamente
              </p>
              <p className="text-xl font-semibold text-white font-mono">
                {health.webhooks.processed24h}
              </p>
            </div>

            <div className="bg-black/30 rounded-xl p-4 border border-red-500/20 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-red-500/10 blur-xl rounded-full" />
              <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2 flex items-center gap-2 relative z-10">
                <AlertCircle size={12} /> Webhooks Fallidos
              </p>
              <p className="text-xl font-semibold text-red-400 font-mono relative z-10">
                {health.webhooks.failed24h}
              </p>
            </div>

            <div className="sm:col-span-2 xl:col-span-1 bg-black/30 rounded-xl p-4 border border-white/5 flex flex-col justify-center">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                Tasa de Éxito
              </p>
              <div className="flex items-end gap-2">
                <p className="text-xl font-semibold text-white font-mono">
                  {webhookSuccessRate.toFixed(1)}
                </p>
                <span className="text-sm font-semibold text-zinc-400 mb-1">
                  %
                </span>
              </div>
              <div className="w-full h-1 bg-white/10 rounded-full mt-3 overflow-hidden">
                <div
                  className={`h-full ${webhookSuccessRate > 95 ? 'bg-emerald-400' : 'bg-red-400'}`}
                  style={{ width: `${webhookSuccessRate}%` }}
                />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
