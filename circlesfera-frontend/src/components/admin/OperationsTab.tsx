import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Calculator,
  Database,
  EyeOff,
  FileWarning,
  PauseCircle,
  Radio,
  RefreshCw,
  Server,
  ShieldAlert,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  adminApi,
  type OperationsCspSummary,
  type OperationsLives,
  type OperationsOrphanFiles,
  type OperationsResources,
  type OperationsWarehouse,
} from '../../services/admin.service';
import { formatDateTime, formatNumber } from '../../utils/format';
import { Button } from '../ui';
import { AdminPageHeader } from './AdminPageHeader';

const UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'];

/** A size in the app language: "1.5 GB", "1,5 GB". */
export function formatBytes(bytes: number, language: string): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  if (unit === 0) return `${value.toLocaleString(language)} B`;
  return new Intl.NumberFormat(language, {
    style: 'unit',
    unit: UNITS[unit],
    unitDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPercent(ratio: number, language: string): string {
  return new Intl.NumberFormat(language, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(ratio);
}

type Tone = 'default' | 'danger' | 'success';

function Metric({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}) {
  const valueClass =
    tone === 'danger'
      ? 'text-red-400'
      : tone === 'success'
        ? 'text-emerald-400'
        : 'text-white';
  return (
    <div className="min-w-0 px-3 py-3">
      <p className="text-xs font-semibold text-white/50 uppercase tracking-wider leading-tight">
        {label}
      </p>
      <p
        className={`text-lg font-bold tabular-nums tracking-tight leading-tight mt-1 ${valueClass}`}
      >
        {value}
      </p>
      {hint && (
        <p className="text-xs text-white/50 mt-1 leading-snug">{hint}</p>
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: typeof Server;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-white/5 bg-white/2 min-w-0">
      <div className="flex items-start gap-3 px-3 py-3 border-b border-white/5">
        <Icon size={16} className="text-white/70 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="text-xs text-white/50 mt-0.5">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Loading() {
  return (
    <div className="p-3 space-y-2 animate-pulse" data-testid="ops-loading">
      <div className="h-12 rounded bg-white/5" />
      <div className="h-12 rounded bg-white/5" />
    </div>
  );
}

function Failed({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-center gap-2 px-3 py-3 text-sm text-red-400"
    >
      <AlertTriangle size={16} className="shrink-0" />
      {message}
    </p>
  );
}

/**
 * One line of a list: a name, then its figures. A name the system gives (a
 * queue, a table) is set as code; a label (`label`) as text.
 */
function Row({
  name,
  figures,
  label = false,
}: {
  name: string;
  figures: string[];
  label?: boolean;
}) {
  return (
    <li className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span
        className={
          label
            ? 'text-sm text-white shrink-0'
            : 'text-sm text-white font-mono break-all'
        }
      >
        {name}
      </span>
      <span className="text-xs text-white/70 tabular-nums sm:text-right">
        {figures.join(' · ')}
      </span>
    </li>
  );
}

function ResourcesBody({ data }: { data: OperationsResources }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const size = (bytes: number | null) =>
    bytes == null ? t('admin.operations.unknown') : formatBytes(bytes, lang);
  // Only the server's disk has a budget (ADR-0024): the alert is said there.
  const disk = (
    usage: OperationsResources['disks']['root'],
    budgeted: boolean,
  ): { value: string; hint?: string; tone: Tone } => {
    if (!usage)
      return { value: t('admin.operations.unknown'), tone: 'default' };
    const sizes = {
      free: formatBytes(usage.freeBytes, lang),
      total: formatBytes(usage.totalBytes, lang),
    };
    return {
      value: formatPercent(usage.usedRatio, lang),
      hint: budgeted
        ? t('admin.operations.disk_alert_hint', {
            ...sizes,
            alert: formatPercent(data.disks.alertRatio, lang),
          })
        : t('admin.operations.disk_hint', sizes),
      tone:
        budgeted && usage.usedRatio >= data.disks.alertRatio
          ? 'danger'
          : 'default',
    };
  };
  const root = disk(data.disks.root, true);
  const uploads = disk(data.disks.uploads, false);
  const { host, process: proc, redis } = data;
  const hostUsed =
    host.memoryTotalBytes != null && host.memoryAvailableBytes != null
      ? host.memoryTotalBytes - host.memoryAvailableBytes
      : null;

  return (
    <>
      <div className="grid grid-cols-2 divide-x divide-y divide-white/5 border-b border-white/5 sm:grid-cols-3">
        <Metric
          label={t('admin.operations.disk_root')}
          value={root.value}
          hint={root.hint}
          tone={root.tone}
        />
        <Metric
          label={t('admin.operations.disk_uploads')}
          value={uploads.value}
          hint={uploads.hint}
          tone={uploads.tone}
        />
        <Metric
          label={t('admin.operations.host_memory')}
          value={size(hostUsed)}
          hint={t('admin.operations.of_total', {
            total: size(host.memoryTotalBytes),
          })}
        />
        <Metric
          label={t('admin.operations.container_memory')}
          value={size(data.container.memoryBytes)}
          hint={
            data.container.memoryLimitBytes == null
              ? t('admin.operations.no_limit')
              : t('admin.operations.of_limit', {
                  limit: size(data.container.memoryLimitBytes),
                })
          }
        />
        <Metric
          label={t('admin.operations.backend_rss')}
          value={size(proc.rssBytes)}
          hint={t('admin.operations.alert_at', {
            limit: size(proc.rssAlertBytes),
          })}
          tone={proc.rssBytes >= proc.rssAlertBytes ? 'danger' : 'default'}
        />
        <Metric
          label={t('admin.operations.backend_heap')}
          value={size(proc.heapUsedBytes)}
          hint={t('admin.operations.alert_at', {
            limit: size(proc.heapAlertBytes),
          })}
          tone={
            proc.heapUsedBytes >= proc.heapAlertBytes ? 'danger' : 'default'
          }
        />
        <Metric
          label={t('admin.operations.cpu_load')}
          value={host.loadAverage
            .map((load) =>
              load.toLocaleString(lang, { maximumFractionDigits: 2 }),
            )
            .join(' / ')}
          hint={t('admin.operations.cpu_hint', { count: host.cpus })}
        />
        <Metric
          label={t('admin.operations.database_size')}
          value={
            data.database.reachable
              ? size(data.database.sizeBytes)
              : t('admin.operations.unreachable')
          }
          hint={t('admin.operations.no_threshold')}
          tone={data.database.reachable ? 'default' : 'danger'}
        />
        <Metric
          label={t('admin.operations.redis_memory')}
          value={
            redis.reachable
              ? size(redis.usedMemoryBytes)
              : t('admin.operations.unreachable')
          }
          hint={
            redis.reachable
              ? t('admin.operations.redis_hint', {
                  limit: redis.maxMemoryBytes
                    ? size(redis.maxMemoryBytes)
                    : t('admin.operations.none'),
                  evicted: formatNumber(redis.evictedKeys ?? 0, lang),
                })
              : undefined
          }
          tone={redis.reachable ? 'default' : 'danger'}
        />
      </div>

      <div className="px-3 pt-3">
        <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider">
          {t('admin.operations.queues_title')}
        </h4>
      </div>
      <ul className="divide-y divide-white/5">
        {data.queues.map((queue) => (
          <Row
            key={queue.name}
            name={queue.name}
            figures={
              queue.reachable
                ? [
                    t('admin.operations.queue_waiting', {
                      value: formatNumber(queue.waiting ?? 0, lang),
                    }),
                    t('admin.operations.queue_active', {
                      value: formatNumber(queue.active ?? 0, lang),
                    }),
                    t('admin.operations.queue_delayed', {
                      value: formatNumber(queue.delayed ?? 0, lang),
                    }),
                    t('admin.operations.queue_failed', {
                      value: formatNumber(queue.failed ?? 0, lang),
                    }),
                  ]
                : [t('admin.operations.unreachable')]
            }
          />
        ))}
      </ul>

      <div className="m-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-300">
          <EyeOff size={16} className="shrink-0" />
          {t('admin.operations.not_visible_title')}
        </p>
        <ul className="mt-2 space-y-1 text-xs text-white/70 list-disc pl-5">
          {data.notVisible.map((key) => (
            <li key={key}>
              {t(`admin.operations.not_visible.${key}`, { defaultValue: key })}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-white/50">
          {t('admin.operations.not_visible_where')}
        </p>
      </div>
    </>
  );
}

function WarehouseBody({ data }: { data: OperationsWarehouse }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  return (
    <>
      <div className="grid grid-cols-2 divide-x divide-y divide-white/5 border-b border-white/5">
        <Metric
          label={t('admin.operations.warehouse_address')}
          value={
            data.configured
              ? t('admin.operations.set')
              : t('admin.operations.unset')
          }
          tone={data.configured ? 'success' : 'default'}
        />
        <Metric
          label={t('admin.operations.export_folder')}
          value={t(`admin.operations.folder.${data.exportFolder}`)}
          tone={data.exportFolder === 'writable' ? 'success' : 'danger'}
        />
        {data.job && (
          <>
            <Metric
              label={t('admin.operations.job_completed')}
              value={formatNumber(data.job.completed, lang)}
            />
            <Metric
              label={t('admin.operations.job_failed')}
              value={formatNumber(data.job.failed, lang)}
              hint={
                data.job.lastFailure
                  ? t(`admin.operations.failure.${data.job.lastFailure}`, {
                      defaultValue: data.job.lastFailure,
                    })
                  : undefined
              }
              tone={data.job.failed > 0 ? 'danger' : 'default'}
            />
          </>
        )}
      </div>
      {data.readError && (
        <Failed message={t('admin.operations.warehouse_unreachable')} />
      )}
      {data.tables && (
        <ul className="divide-y divide-white/5">
          {data.tables.map((table) => (
            <Row
              key={table.name}
              name={table.name}
              figures={[
                t('admin.operations.rows', {
                  value: formatNumber(table.rows, lang),
                }),
                formatBytes(table.bytes, lang),
                table.newestRowUnknown
                  ? t('admin.operations.newest_unknown')
                  : table.newestRowAt
                    ? t('admin.operations.newest', {
                        date: formatDateTime(
                          `${table.newestRowAt.replace(' ', 'T')}Z`,
                          lang,
                        ),
                      })
                    : t('admin.operations.no_newest'),
              ]}
            />
          ))}
        </ul>
      )}
      <div className="px-3 pt-3">
        <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider">
          {t('admin.operations.recent_exports')}
        </h4>
      </div>
      {data.recentExports.length === 0 ? (
        <p className="px-3 py-3 text-sm text-white/50">
          {t('admin.operations.no_exports')}
        </p>
      ) : (
        <ul className="divide-y divide-white/5">
          {data.recentExports.map((entry) => (
            <Row
              key={entry.name}
              name={entry.name}
              figures={Object.entries(entry.rows).map(
                ([table, rows]) => `${table} ${formatNumber(rows, lang)}`,
              )}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function CspBody({ data }: { data: OperationsCspSummary }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  if (data.days === 0) {
    return (
      <p className="px-3 py-3 text-sm text-white/50">
        {t('admin.operations.csp_none')}
      </p>
    );
  }
  return (
    <>
      <div className="grid grid-cols-2 divide-x divide-white/5 border-b border-white/5">
        <Metric
          label={t('admin.operations.csp_total')}
          value={formatNumber(data.total, lang)}
        />
        <Metric
          label={t('admin.operations.csp_days', { count: data.days })}
          value={formatNumber(data.days, lang)}
          hint={t('admin.operations.csp_range', {
            from: data.firstDay,
            to: data.lastDay,
          })}
        />
      </div>
      <ul className="divide-y divide-white/5">
        {data.rows.map((row) => (
          <Row
            key={`${row.disposition}|${row.directive}|${row.blocked}`}
            name={row.blocked}
            figures={[
              row.directive,
              row.disposition,
              formatNumber(row.count, lang),
            ]}
          />
        ))}
      </ul>
    </>
  );
}

const BREAKDOWN_GROUPS = [
  'age',
  'size',
  'extension',
  'owner',
  'shape',
] as const;

function OrphansBody({ data }: { data: OperationsOrphanFiles }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  if (data.status === 'no_local_storage') {
    return (
      <p className="px-3 py-3 text-sm text-white/50">
        {t('admin.operations.orphans_no_local')}
      </p>
    );
  }
  const count = (value: number) => formatNumber(value, lang);
  const held = data.heldBack;
  return (
    <>
      {held && (
        <div
          role="status"
          className="m-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3"
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-300">
            <PauseCircle size={16} className="shrink-0" />
            {t('admin.operations.orphans_held_title')}
          </p>
          <p className="mt-1 text-xs text-white/70">
            {held.reason === 'no_references'
              ? t('admin.operations.orphans_held_no_references')
              : t('admin.operations.orphans_held_share', {
                  unused: count(held.recentOrphans),
                  files: count(held.recentFiles),
                  days: data.policy.shareWindowDays,
                  share: formatPercent(data.policy.maxShare, lang),
                })}
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 divide-x divide-y divide-white/5 border-b border-white/5 sm:grid-cols-3">
        <Metric
          label={t('admin.operations.orphans_next_run')}
          value={count(data.nextRun.count)}
          hint={formatBytes(data.nextRun.bytes, lang)}
          tone={
            held ? 'default' : data.nextRun.count > 0 ? 'danger' : 'success'
          }
        />
        <Metric
          label={t('admin.operations.orphans_unused', {
            hours: data.policy.graceHours,
          })}
          value={count(data.orphans.count)}
          hint={
            held
              ? formatBytes(data.orphans.bytes, lang)
              : t('admin.operations.orphans_unused_hint', {
                  size: formatBytes(data.orphans.bytes, lang),
                  nights: data.orphans.nights,
                  perNight: data.policy.deletionsPerNight,
                })
          }
        />
        <Metric
          label={t('admin.operations.orphans_files')}
          value={count(data.files.count)}
          hint={formatBytes(data.files.bytes, lang)}
        />
        <Metric
          label={t('admin.operations.orphans_used')}
          value={count(data.used)}
        />
        <Metric
          label={t('admin.operations.orphans_kept_deleted', {
            days: data.policy.deletedContentKeptDays,
          })}
          value={count(data.keptDeleted)}
        />
        <Metric
          label={t('admin.operations.orphans_recent', {
            hours: data.policy.graceHours,
          })}
          value={count(data.unusedRecent)}
        />
        <Metric
          label={t('admin.operations.orphans_foreign')}
          value={count(data.foreign)}
        />
        <Metric
          label={t('admin.operations.orphans_unrecorded')}
          value={count(data.unrecordedOnDisk)}
        />
      </div>
      {data.orphans.count > 0 && (
        <ul className="divide-y divide-white/5">
          {BREAKDOWN_GROUPS.map((group) => (
            <Row
              key={group}
              label
              name={t(`admin.operations.breakdown.${group}`)}
              figures={Object.entries(data.breakdown[group])
                .sort(([, a], [, b]) => b - a)
                .map(
                  ([key, value]) =>
                    `${t(`admin.operations.breakdown_key.${key}`, {
                      defaultValue: key,
                    })} ${count(value)}`,
                )}
            />
          ))}
        </ul>
      )}
      <p className="px-3 py-3 text-xs text-white/50">
        {t('admin.operations.orphans_record', {
          rows: count(data.record.rows),
          withOwner: count(data.record.withOwner),
          withoutOwner: count(data.record.withoutOwner),
          missing: count(data.record.missingOnDisk),
        })}
      </p>
    </>
  );
}

function LivesBody({ data }: { data: OperationsLives }) {
  const { t, i18n } = useTranslation();
  const count = (n: number) => formatNumber(n, i18n.language);
  const { lives, recordings } = data;
  return (
    <>
      <div className="grid grid-cols-2 divide-x divide-white/5">
        <Metric
          label={t('admin.operations.lives_on_air')}
          value={t('admin.operations.lives_of_limit', {
            value: count(lives.onAir),
            limit: count(lives.limit),
          })}
          tone={lives.onAir >= lives.limit ? 'danger' : 'default'}
          hint={
            !lives.roomsRead
              ? t('admin.operations.lives_rooms_unread')
              : lives.withoutRoom > 0
                ? t('admin.operations.lives_without_room', {
                    count: lives.withoutRoom,
                  })
                : undefined
          }
        />
        <Metric
          label={t('admin.operations.lives_recorded')}
          value={t('admin.operations.lives_of_limit', {
            value: count(recordings.running),
            limit: count(recordings.limit),
          })}
          tone={
            recordings.enabled && recordings.running >= recordings.limit
              ? 'danger'
              : 'default'
          }
          hint={
            recordings.enabled
              ? undefined
              : t('admin.operations.lives_recording_off')
          }
        />
      </div>
      <p className="px-3 py-3 text-xs text-white/50 border-t border-white/5">
        {t('admin.operations.lives_limits_hint')}
      </p>
    </>
  );
}

/**
 * The Operations page of the Backoffice: the server's resources, the
 * analytics warehouse, the CSP reports and the orphan files, read from the
 * backend. Read only; the API checks the system permission on each request.
 */
export default function OperationsTab() {
  const { t, i18n } = useTranslation();
  const resources = useQuery({
    queryKey: ['admin', 'operations', 'resources'],
    queryFn: adminApi.getOperationsResources,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const warehouse = useQuery({
    queryKey: ['admin', 'operations', 'warehouse'],
    queryFn: adminApi.getOperationsWarehouse,
  });
  const lives = useQuery({
    queryKey: ['admin', 'operations', 'lives'],
    queryFn: adminApi.getOperationsLives,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const csp = useQuery({
    queryKey: ['admin', 'operations', 'csp'],
    queryFn: adminApi.getOperationsCsp,
  });
  // It reads every stored file and every row that names one: asked only
  // when staff press its button. The server keeps its last answer a while.
  const orphans = useQuery({
    queryKey: ['admin', 'operations', 'orphan-files'],
    queryFn: adminApi.getOperationsOrphanFiles,
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const queries = [resources, lives, warehouse, csp];
  const refreshing = queries.some((query) => query.isFetching);

  const body = <T,>(
    query: { data?: T; isLoading: boolean; isError: boolean },
    render: (data: T) => ReactNode,
  ) => {
    if (query.isLoading) return <Loading />;
    if (query.isError || query.data === undefined) {
      return <Failed message={t('admin.operations.load_error')} />;
    }
    return render(query.data);
  };

  return (
    <div className="space-y-3">
      <AdminPageHeader
        title={t('admin.operations.title')}
        subtitle={
          resources.data
            ? t('admin.operations.subtitle_at', {
                time: formatDateTime(resources.data.generatedAt, i18n.language),
              })
            : t('admin.operations.subtitle')
        }
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              for (const query of queries) void query.refetch();
            }}
            isLoading={refreshing}
            className="min-h-11"
          >
            <RefreshCw size={16} className="mr-2" />
            {t('admin.operations.refresh')}
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start">
        <div className="space-y-3 min-w-0">
          <Section
            title={t('admin.operations.resources_title')}
            subtitle={t('admin.operations.resources_subtitle')}
            icon={Server}
          >
            {body(resources, (data) => (
              <ResourcesBody data={data} />
            ))}
          </Section>
          <Section
            title={t('admin.operations.lives_title')}
            subtitle={t('admin.operations.lives_subtitle')}
            icon={Radio}
          >
            {body(lives, (data) => (
              <LivesBody data={data} />
            ))}
          </Section>
        </div>
        <div className="space-y-3 min-w-0">
          <Section
            title={t('admin.operations.warehouse_title')}
            subtitle={t('admin.operations.warehouse_subtitle')}
            icon={Database}
          >
            {body(warehouse, (data) => (
              <WarehouseBody data={data} />
            ))}
          </Section>
          <Section
            title={t('admin.operations.orphans_title')}
            subtitle={t('admin.operations.orphans_subtitle')}
            icon={FileWarning}
          >
            <div className="flex flex-col gap-2 px-3 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-white/50">
                {orphans.data
                  ? t('admin.operations.orphans_computed_at', {
                      time: formatDateTime(
                        orphans.data.generatedAt,
                        i18n.language,
                      ),
                    })
                  : t('admin.operations.orphans_not_computed')}
              </p>
              <Button
                variant="secondary"
                onClick={() => void orphans.refetch()}
                isLoading={orphans.isFetching}
                className="min-h-11 shrink-0"
              >
                <Calculator size={16} className="mr-2" />
                {orphans.data
                  ? t('admin.operations.orphans_recompute')
                  : t('admin.operations.orphans_compute')}
              </Button>
            </div>
            {orphans.isFetching && !orphans.data ? (
              <Loading />
            ) : orphans.isError ? (
              <Failed message={t('admin.operations.load_error')} />
            ) : orphans.data ? (
              <OrphansBody data={orphans.data} />
            ) : (
              <div className="h-3" />
            )}
          </Section>
          <Section
            title={t('admin.operations.csp_title')}
            subtitle={t('admin.operations.csp_subtitle')}
            icon={ShieldAlert}
          >
            {body(csp, (data) => (
              <CspBody data={data} />
            ))}
          </Section>
        </div>
      </div>
    </div>
  );
}
