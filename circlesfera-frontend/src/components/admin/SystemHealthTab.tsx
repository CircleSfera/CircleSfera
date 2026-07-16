import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Activity,
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
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-8 text-center flex flex-col items-center">
        <AlertTriangle className="text-red-500 mb-4" size={48} />
        <h3 className="text-xl font-bold text-white mb-2">
          Error Crítico de Monitoreo
        </h3>
        <p className="text-red-400/80 mb-6 max-w-md mx-auto">
          No se ha podido conectar con el servicio de monitoreo de
          infraestructura de CircleSfera.
        </p>
        <Button
          variant="danger"
          onClick={() => refetch()}
          className="uppercase tracking-wide text-xs"
        >
          <RefreshCw size={16} />
          Reintentar Conexión
        </Button>
      </div>
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
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
            <Activity className="text-brand-primary" />
            Estado del Sistema
          </h2>
          <p className="text-zinc-400 text-xs font-bold uppercase tracking-wide mt-1">
            "God View" de Infraestructura CircleSfera
          </p>
        </div>

        <div className="flex items-center gap-4">
          <p className="text-xs text-zinc-400 font-mono">
            Última vez: {new Date(health.timestamp).toLocaleTimeString()}
          </p>
          <Button
            variant="secondary"
            size="icon"
            onClick={() => refetch()}
            isLoading={isRefetching}
            className="text-gray-300 hover:text-white"
          >
            <RefreshCw size={20} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">
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
              <span className="text-xs text-zinc-400 font-bold uppercase tracking-wide">
                Estado
              </span>
              <span className={`text-xl font-black ${dbColor}`}>
                {health.database.status}
              </span>
            </div>
            <div className="w-full h-px bg-white/5" />
            <div className="flex justify-between items-end">
              <span className="text-xs text-zinc-400 font-bold uppercase tracking-wide">
                Latencia Raw
              </span>
              <span className="text-xl font-black text-white font-mono">
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
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">
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
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1">
                En Cola
              </p>
              <p className="text-xl font-black text-white font-mono">
                {health.queues.ai.wait}
              </p>
            </div>
            <div className="bg-black/20 rounded-xl p-3 border border-red-500/20">
              <p className="text-xs font-bold text-red-500 uppercase tracking-wide mb-1">
                Fallidos
              </p>
              <p className="text-xl font-black text-red-400 font-mono">
                {health.queues.ai.failed}
              </p>
            </div>
            <div className="bg-black/20 rounded-xl p-3">
              <p className="text-xs font-bold text-emerald-500 uppercase tracking-wide mb-1">
                Completados
              </p>
              <p className="text-xl font-black text-emerald-400 font-mono">
                {health.queues.ai.completed}
              </p>
            </div>
            <div className="bg-black/20 rounded-xl p-3">
              <p className="text-xs font-bold text-brand-primary uppercase tracking-wide mb-1">
                Activos
              </p>
              <p className="text-xl font-black text-white font-mono">
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
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">
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
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wide mb-1">
                En Cola
              </p>
              <p className="text-xl font-black text-white font-mono">
                {health.queues.analytics.wait}
              </p>
            </div>
            <div className="bg-black/20 rounded-xl p-3 border border-red-500/20">
              <p className="text-xs font-bold text-red-500 uppercase tracking-wide mb-1">
                Fallidos
              </p>
              <p className="text-xl font-black text-red-400 font-mono">
                {health.queues.analytics.failed}
              </p>
            </div>
            <div className="bg-black/20 rounded-xl p-3">
              <p className="text-xs font-bold text-emerald-500 uppercase tracking-wide mb-1">
                Completados
              </p>
              <p className="text-xl font-black text-emerald-400 font-mono">
                {health.queues.analytics.completed}
              </p>
            </div>
            <div className="bg-black/20 rounded-xl p-3">
              <p className="text-xs font-bold text-brand-primary uppercase tracking-wide mb-1">
                Activos
              </p>
              <p className="text-xl font-black text-white font-mono">
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
          className="lg:col-span-3 p-6 rounded-lg glass-panel border border-white/5 relative overflow-hidden flex flex-col md:flex-row items-center gap-8"
        >
          <div className="flex items-center gap-4 md:w-1/3">
            <div className="w-16 h-16 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white shadow-xl">
              <Webhook size={32} />
            </div>
            <div>
              <h3 className="text-lg font-black text-white uppercase tracking-wide">
                Stripe Webhooks
              </h3>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wide mt-1">
                Sincronización (Últimas 24h)
              </p>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4 w-full">
            <div className="bg-black/30 rounded-xl p-4 border border-white/5">
              <p className="text-xs font-bold text-emerald-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                <CheckCircle2 size={12} /> Procesados Exitosamente
              </p>
              <p className="text-xl font-black text-white font-mono">
                {health.webhooks.processed24h}
              </p>
            </div>

            <div className="bg-black/30 rounded-xl p-4 border border-red-500/20 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-red-500/10 blur-xl rounded-full" />
              <p className="text-xs font-bold text-red-500 uppercase tracking-wide mb-2 flex items-center gap-2 relative z-10">
                <AlertCircle size={12} /> Webhooks Fallidos
              </p>
              <p className="text-xl font-black text-red-400 font-mono relative z-10">
                {health.webhooks.failed24h}
              </p>
            </div>

            <div className="col-span-2 md:col-span-1 bg-black/30 rounded-xl p-4 border border-white/5 flex flex-col justify-center">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wide mb-2">
                Tasa de Éxito
              </p>
              <div className="flex items-end gap-2">
                <p className="text-xl font-black text-white font-mono">
                  {webhookSuccessRate.toFixed(1)}
                </p>
                <span className="text-sm font-bold text-zinc-400 mb-1">%</span>
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
