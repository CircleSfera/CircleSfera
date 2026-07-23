import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  RefreshCw,
  RotateCcw,
  Server,
  Webhook,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminWebhookEvent } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import { Button } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminPageHeader } from './AdminPageHeader';
import { FilterDropdown, Pagination } from './AdminTable';

export default function SystemHealthTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [webhookPage, setWebhookPage] = useState(1);
  const [webhookStatusFilter, setWebhookStatusFilter] = useState('FAILED');
  const [expandedWebhookId, setExpandedWebhookId] = useState<string | null>(
    null,
  );

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

  const { data: webhookData, isLoading: webhooksLoading } = useQuery<
    PaginatedResponse<AdminWebhookEvent>
  >({
    queryKey: ['admin', 'webhooks', webhookPage, webhookStatusFilter],
    queryFn: () =>
      adminApi
        .getWebhookEvents(webhookPage, 20, webhookStatusFilter || undefined)
        .then((res) => res.data as PaginatedResponse<AdminWebhookEvent>),
  });

  const replayMutation = useMutation({
    mutationFn: (id: string) => adminApi.replayWebhookEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'webhooks'] });
      queryClient.invalidateQueries({ queryKey: ['systemHealth'] });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <AdminPageHeader
          title={t('admin.health.title')}
          subtitle={t('admin.health.subtitle')}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-44 rounded-lg border border-white/5 bg-white/5"
            />
          ))}
          <div className="col-span-full h-28 rounded-lg border border-white/5 bg-white/5" />
        </div>
      </div>
    );
  }

  if (isError || !health) {
    return (
      <div className="space-y-4">
        <AdminPageHeader
          title={t('admin.health.title')}
          subtitle={t('admin.health.subtitle')}
        />
        <AdminEmptyState
          icon={AlertTriangle}
          title={t('admin.health.error_title')}
          description={t('admin.health.error_description')}
          className="bg-red-500/10 border-red-500/20"
          action={
            <Button
              variant="danger"
              onClick={() => refetch()}
              className="uppercase tracking-wide text-xs min-h-11"
            >
              <RefreshCw size={16} className="mr-2" />
              {t('admin.health.retry')}
            </Button>
          }
        />
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
    <div className="space-y-4">
      <AdminPageHeader
        title={t('admin.health.title')}
        subtitle={t('admin.health.subtitle_live', {
          time: new Date(health.timestamp).toLocaleTimeString(),
        })}
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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {/* PostgreSQL Database */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 sm:p-5 rounded-lg border ${dbBorder} ${dbBg} relative overflow-hidden`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${dbColor} bg-black/20`}
              >
                <Database size={20} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white uppercase tracking-wide">
                  {t('admin.health.database_title')}
                </h3>
                <p className="text-xs font-mono text-zinc-400">
                  {t('admin.health.database_subtitle')}
                </p>
              </div>
            </div>
            {isDbHealthy ? (
              <CheckCircle2 size={24} className="text-emerald-400" />
            ) : (
              <AlertCircle size={24} className="text-red-400" />
            )}
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-end">
              <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wide">
                {t('admin.health.status_label')}
              </span>
              <span className={`text-xl font-semibold ${dbColor}`}>
                {health.database.status}
              </span>
            </div>
            <div className="w-full h-px bg-white/5" />
            <div className="flex justify-between items-end">
              <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wide">
                {t('admin.health.latency_label')}
              </span>
              <span className="text-xl font-semibold text-white font-mono">
                {health.database.latencyMs}{' '}
                <span className="text-xs text-zinc-400">
                  {t('admin.health.latency_ms')}
                </span>
              </span>
            </div>
          </div>
        </motion.div>

        {/* AI Processing BullMQ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`p-4 sm:p-5 rounded-lg border ${isAiQueueHealthy ? 'border-indigo-500/20 bg-indigo-500/10' : 'border-amber-500/20 bg-amber-500/10'} relative overflow-hidden`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${isAiQueueHealthy ? 'text-indigo-400' : 'text-amber-400'} bg-black/20`}
              >
                <BrainCircuit size={20} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white uppercase tracking-wide">
                  {t('admin.health.ai_queue_title')}
                </h3>
                <p className="text-xs font-mono text-zinc-400">
                  {t('admin.health.ai_queue_subtitle')}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <div className="bg-black/20 rounded-lg p-2.5 sm:p-3">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">
                {t('admin.health.queue_waiting')}
              </p>
              <p className="text-xl font-semibold text-white font-mono">
                {health.queues.ai.wait}
              </p>
            </div>
            <div className="bg-black/20 rounded-lg p-2.5 sm:p-3 border border-red-500/20">
              <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-1">
                {t('admin.health.queue_failed')}
              </p>
              <p className="text-xl font-semibold text-red-400 font-mono">
                {health.queues.ai.failed}
              </p>
            </div>
            <div className="bg-black/20 rounded-lg p-2.5 sm:p-3">
              <p className="text-xs font-semibold text-emerald-500 uppercase tracking-wide mb-1">
                {t('admin.health.queue_completed')}
              </p>
              <p className="text-xl font-semibold text-emerald-400 font-mono">
                {health.queues.ai.completed}
              </p>
            </div>
            <div className="bg-black/20 rounded-lg p-2.5 sm:p-3">
              <p className="text-xs font-semibold text-brand-primary uppercase tracking-wide mb-1">
                {t('admin.health.queue_active')}
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
          className={`p-4 sm:p-5 rounded-lg border ${isAnalyticsQueueHealthy ? 'border-brand-primary/20 bg-brand-primary/10' : 'border-amber-500/20 bg-amber-500/10'} relative overflow-hidden`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${isAnalyticsQueueHealthy ? 'text-brand-primary' : 'text-amber-400'} bg-black/20`}
              >
                <Server size={20} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white uppercase tracking-wide">
                  {t('admin.health.analytics_queue_title')}
                </h3>
                <p className="text-xs font-mono text-zinc-400">
                  {t('admin.health.analytics_queue_subtitle')}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <div className="bg-black/20 rounded-lg p-2.5 sm:p-3">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">
                {t('admin.health.queue_waiting')}
              </p>
              <p className="text-xl font-semibold text-white font-mono">
                {health.queues.analytics.wait}
              </p>
            </div>
            <div className="bg-black/20 rounded-lg p-2.5 sm:p-3 border border-red-500/20">
              <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-1">
                {t('admin.health.queue_failed')}
              </p>
              <p className="text-xl font-semibold text-red-400 font-mono">
                {health.queues.analytics.failed}
              </p>
            </div>
            <div className="bg-black/20 rounded-lg p-2.5 sm:p-3">
              <p className="text-xs font-semibold text-emerald-500 uppercase tracking-wide mb-1">
                {t('admin.health.queue_completed')}
              </p>
              <p className="text-xl font-semibold text-emerald-400 font-mono">
                {health.queues.analytics.completed}
              </p>
            </div>
            <div className="bg-black/20 rounded-lg p-2.5 sm:p-3">
              <p className="text-xs font-semibold text-brand-primary uppercase tracking-wide mb-1">
                {t('admin.health.queue_active')}
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
          className="col-span-full p-4 sm:p-5 rounded-lg glass-panel border border-white/5 relative overflow-hidden flex flex-col md:flex-row items-center gap-4 sm:gap-6"
        >
          <div className="flex items-center gap-3 md:w-1/3">
            <div className="w-12 h-12 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white shrink-0">
              <Webhook size={24} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-semibold text-white uppercase tracking-wide">
                {t('admin.health.stripe_webhooks_title')}
              </h3>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mt-0.5">
                {t('admin.health.stripe_webhooks_subtitle')}
              </p>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 w-full">
            <div className="bg-black/30 rounded-lg p-3 border border-white/5">
              <p className="text-xs font-semibold text-emerald-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                <CheckCircle2 size={12} />{' '}
                {t('admin.health.webhooks_processed')}
              </p>
              <p className="text-xl font-semibold text-white font-mono">
                {health.webhooks.processed24h}
              </p>
            </div>

            <div className="bg-black/30 rounded-lg p-3 border border-red-500/20 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-red-500/10 blur-xl rounded-full" />
              <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2 flex items-center gap-2 relative z-10">
                <AlertCircle size={12} /> {t('admin.health.webhooks_failed')}
              </p>
              <p className="text-xl font-semibold text-red-400 font-mono relative z-10">
                {health.webhooks.failed24h}
              </p>
            </div>

            <div className="sm:col-span-2 xl:col-span-1 bg-black/30 rounded-lg p-3 border border-white/5 flex flex-col justify-center">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                {t('admin.health.success_rate')}
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

      {/* Webhook Events Queue */}
      <div className="space-y-3">
        <AdminPageHeader
          title={t('admin.health.webhooks_title')}
          subtitle={t('admin.health.webhooks_subtitle')}
        />

        <AdminFilterBar>
          <FilterDropdown
            label={t('admin.health.webhook_filter')}
            value={webhookStatusFilter}
            onChange={(v) => {
              setWebhookStatusFilter(v);
              setWebhookPage(1);
              setExpandedWebhookId(null);
            }}
            options={[
              {
                value: 'FAILED',
                label: t('admin.health.webhook_failed'),
              },
              {
                value: 'PENDING',
                label: t('admin.health.webhook_pending'),
              },
              {
                value: '',
                label: t('admin.shared.all'),
              },
            ]}
          />
        </AdminFilterBar>

        <div className="rounded-xl border border-white/10 overflow-hidden">
          {webhooksLoading ? (
            <div className="p-6 text-sm text-gray-400 animate-pulse">
              {t('admin.table.loading')}
            </div>
          ) : !webhookData || webhookData.data.length === 0 ? (
            <AdminEmptyState
              icon={Webhook}
              title={t('admin.health.webhooks_empty')}
              description={t('admin.health.webhooks_empty_description')}
              compact
            />
          ) : (
            <div className="divide-y divide-white/5">
              {webhookData.data.map((event) => {
                const isExpanded = expandedWebhookId === event.id;
                const canReplay =
                  event.status === 'FAILED' || event.status === 'PENDING';

                return (
                  <div key={event.id} className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-white">
                            {event.provider}
                          </span>
                          <span
                            className={`text-xs font-semibold uppercase px-2 py-0.5 rounded ${
                              event.status === 'FAILED'
                                ? 'bg-red-500/20 text-red-400'
                                : event.status === 'PENDING'
                                  ? 'bg-yellow-500/20 text-yellow-500'
                                  : 'bg-green-500/20 text-green-500'
                            }`}
                          >
                            {event.status}
                          </span>
                        </div>
                        <p className="text-xs font-mono text-gray-500 truncate mt-0.5">
                          {event.externalId}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(event.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {canReplay && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => replayMutation.mutate(event.id)}
                            isLoading={replayMutation.isPending}
                            className="min-h-10 text-xs"
                          >
                            <RotateCcw size={14} className="mr-1.5 shrink-0" />
                            {t('admin.health.replay')}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setExpandedWebhookId(isExpanded ? null : event.id)
                          }
                          className="min-h-10 min-w-10 text-gray-400"
                          aria-label={
                            isExpanded
                              ? t('common.collapse', 'Contraer')
                              : t('common.expand', 'Expandir')
                          }
                        >
                          {isExpanded ? (
                            <ChevronUp size={18} />
                          ) : (
                            <ChevronDown size={18} />
                          )}
                        </Button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="mt-3 p-3 rounded-lg bg-black/30 border border-white/5 text-xs space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <span className="text-gray-500 uppercase tracking-wide font-semibold">
                              {t('admin.health.provider')}
                            </span>
                            <p className="text-white font-mono mt-0.5">
                              {event.provider}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500 uppercase tracking-wide font-semibold">
                              {t('admin.health.external_id')}
                            </span>
                            <p className="text-white font-mono mt-0.5 break-all">
                              {event.externalId}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500 uppercase tracking-wide font-semibold">
                              {t('admin.health.status')}
                            </span>
                            <p className="text-white font-mono mt-0.5">
                              {event.status}
                            </p>
                          </div>
                        </div>
                        {event.processedAt && (
                          <p className="text-gray-500">
                            {t('admin.health.processed_at')}:{' '}
                            {new Date(event.processedAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {webhookData && webhookData.meta?.totalPages > 1 && (
            <div className="p-2 border-t border-white/5">
              <Pagination
                meta={webhookData.meta}
                onPageChange={setWebhookPage}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
