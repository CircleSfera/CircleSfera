import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminWebhookEvent } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import { Button } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminPageHeader } from './AdminPageHeader';
import { FilterDropdown, Pagination } from './AdminTable';

function MetricCell({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'danger' | 'success' | 'accent';
}) {
  const valueClass =
    tone === 'danger'
      ? 'text-red-400'
      : tone === 'success'
        ? 'text-emerald-400'
        : tone === 'accent'
          ? 'text-brand-primary'
          : 'text-white';
  return (
    <div className="min-w-0 px-3 py-2.5">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide truncate">
        {label}
      </p>
      <p
        className={`text-lg font-semibold font-mono tabular-nums leading-tight mt-0.5 ${valueClass}`}
      >
        {value}
      </p>
    </div>
  );
}

export default function SystemHealthTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [webhookPage, setWebhookPage] = useState(1);
  const [webhookStatusFilter, setWebhookStatusFilter] = useState('FAILED');
  const [expandedWebhookId, setExpandedWebhookId] = useState<string | null>(
    null,
  );
  const [now, setNow] = useState(() => Date.now());

  const {
    data: health,
    isLoading,
    isError,
    refetch,
    isRefetching,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['systemHealth'],
    queryFn: adminApi.getSystemHealth,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const { data: webhookData, isLoading: webhooksLoading } = useQuery<
    PaginatedResponse<AdminWebhookEvent>
  >({
    queryKey: ['admin', 'webhooks', webhookPage, webhookStatusFilter],
    queryFn: () =>
      adminApi
        .getWebhookEvents(webhookPage, 20, webhookStatusFilter || undefined)
        .then((res) => res.data as PaginatedResponse<AdminWebhookEvent>),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const replayMutation = useMutation({
    mutationFn: (id: string) => adminApi.replayWebhookEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'webhooks'] });
      queryClient.invalidateQueries({ queryKey: ['systemHealth'] });
    },
  });

  const secondsAgo = dataUpdatedAt
    ? Math.max(0, Math.floor((now - dataUpdatedAt) / 1000))
    : null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <AdminPageHeader
          title={t('admin.health.title')}
          subtitle={t('admin.health.subtitle')}
        />
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-white/5" />
          ))}
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
    <div className="space-y-5">
      <AdminPageHeader
        title={t('admin.health.title')}
        subtitle={t('admin.health.subtitle_live', {
          time: new Date(health.timestamp).toLocaleTimeString(),
        })}
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 text-[11px] font-semibold uppercase tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {t('admin.health.live_badge', 'Live')}
              {secondsAgo !== null && (
                <span className="text-emerald-400/70 font-normal normal-case tracking-normal">
                  · {t('admin.health.updated_ago', { seconds: secondsAgo })}
                </span>
              )}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              isLoading={isRefetching}
              className="text-gray-500 hover:text-white min-h-11 min-w-11"
              aria-label={t('admin.health.retry')}
            >
              <RefreshCw size={18} />
            </Button>
          </div>
        }
      />

      <div className="space-y-3">
        {/* Database */}
        <section className="rounded-lg border border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/5">
            <Database
              size={16}
              className={isDbHealthy ? 'text-emerald-400' : 'text-red-400'}
            />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-white">
                {t('admin.health.database_title')}
              </h3>
              <p className="text-[11px] text-gray-500 font-mono">
                {t('admin.health.database_subtitle')}
              </p>
            </div>
            {isDbHealthy ? (
              <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle size={18} className="text-red-400 shrink-0" />
            )}
          </div>
          <div className="grid grid-cols-2 divide-x divide-white/5">
            <MetricCell
              label={t('admin.health.status_label')}
              value={health.database.status}
              tone={isDbHealthy ? 'success' : 'danger'}
            />
            <MetricCell
              label={t('admin.health.latency_label')}
              value={`${health.database.latencyMs} ${t('admin.health.latency_ms')}`}
            />
          </div>
        </section>

        {/* AI queue */}
        <section className="rounded-lg border border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/5">
            <BrainCircuit
              size={16}
              className={
                isAiQueueHealthy ? 'text-indigo-400' : 'text-amber-400'
              }
            />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white">
                {t('admin.health.ai_queue_title')}
              </h3>
              <p className="text-[11px] text-gray-500 font-mono">
                {t('admin.health.ai_queue_subtitle')}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-white/5">
            <MetricCell
              label={t('admin.health.queue_waiting')}
              value={health.queues.ai.wait}
            />
            <MetricCell
              label={t('admin.health.queue_failed')}
              value={health.queues.ai.failed}
              tone="danger"
            />
            <MetricCell
              label={t('admin.health.queue_completed')}
              value={health.queues.ai.completed}
              tone="success"
            />
            <MetricCell
              label={t('admin.health.queue_active')}
              value={health.queues.ai.active}
              tone="accent"
            />
          </div>
        </section>

        {/* Analytics queue */}
        <section className="rounded-lg border border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/5">
            <Server
              size={16}
              className={
                isAnalyticsQueueHealthy
                  ? 'text-brand-primary'
                  : 'text-amber-400'
              }
            />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white">
                {t('admin.health.analytics_queue_title')}
              </h3>
              <p className="text-[11px] text-gray-500 font-mono">
                {t('admin.health.analytics_queue_subtitle')}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-white/5">
            <MetricCell
              label={t('admin.health.queue_waiting')}
              value={health.queues.analytics.wait}
            />
            <MetricCell
              label={t('admin.health.queue_failed')}
              value={health.queues.analytics.failed}
              tone="danger"
            />
            <MetricCell
              label={t('admin.health.queue_completed')}
              value={health.queues.analytics.completed}
              tone="success"
            />
            <MetricCell
              label={t('admin.health.queue_active')}
              value={health.queues.analytics.active}
              tone="accent"
            />
          </div>
        </section>

        {/* Stripe webhooks */}
        <section className="rounded-lg border border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/5">
            <Webhook size={16} className="text-gray-300" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white">
                {t('admin.health.stripe_webhooks_title')}
              </h3>
              <p className="text-[11px] text-gray-500">
                {t('admin.health.stripe_webhooks_subtitle')}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/5">
            <MetricCell
              label={t('admin.health.webhooks_processed')}
              value={health.webhooks.processed24h}
              tone="success"
            />
            <MetricCell
              label={t('admin.health.webhooks_failed')}
              value={health.webhooks.failed24h}
              tone="danger"
            />
            <div className="px-3 py-2.5">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                {t('admin.health.success_rate')}
              </p>
              <p className="text-lg font-semibold font-mono text-white tabular-nums mt-0.5">
                {webhookSuccessRate.toFixed(1)}%
              </p>
              <div className="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
                <div
                  className={`h-full ${webhookSuccessRate > 95 ? 'bg-emerald-400' : 'bg-red-400'}`}
                  style={{ width: `${webhookSuccessRate}%` }}
                />
              </div>
            </div>
          </div>
        </section>
      </div>

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

        <div className="rounded-lg border border-white/5 overflow-hidden">
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
                  <div key={event.id} className="p-3.5">
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
                      <div className="mt-3 p-3 rounded-lg bg-white/[0.03] text-xs space-y-2">
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
