import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AuditLogEntry } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminListSkeleton } from './AdminSkeletons';
import { AdminSplitView } from './AdminSplitView';
import { FilterDropdown, Pagination, SearchInput } from './AdminTable';

const AUDIT_ACTION_KEYS = [
  'BAN_USER',
  'UNBAN_USER',
  'DELETE_USER',
  'PROMOTE_USER',
  'DEMOTE_USER',
  'UPDATE_USER_STATUS',
  'DELETE_POST',
  'DELETE_COMMENT',
  'DELETE_STORY',
  'CONTENT_REMOVED',
  'CONTENT_RESTRICTED',
  'CONTENT_RESTORED',
  'CONTENT_LABELED',
  'REPORT_REVIEWED',
  'REPORT_RESOLVED',
  'REPORT_DISMISSED',
  'REPORT_ESCALATED',
  'UPDATE_WHITELIST',
  'DELETE_WHITELIST',
  'ACCOUNT_WARNED',
  'ACCOUNT_SUSPENDED',
  'ACCOUNT_RESTORED',
  'SUBSCRIPTION_ADJUSTED',
  'SUBSCRIPTION_CANCELLED',
  'PROMOTION_REJECTED',
  'CREATE_AUDIO',
  'UPDATE_AUDIO',
  'DELETE_AUDIO',
  'MANUAL_OVERRIDE',
] as const;

const ACTION_COLORS: Record<string, string> = {
  BAN_USER: 'text-red-400',
  UNBAN_USER: 'text-green-400',
  DELETE_POST: 'text-red-400',
  DELETE_USER: 'text-red-500',
  PROMOTE_USER: 'text-yellow-400',
  DEMOTE_USER: 'text-gray-300',
  REPORT_RESOLVED: 'text-green-400',
  REPORT_DISMISSED: 'text-gray-300',
  DELETE_COMMENT: 'text-red-400',
  DELETE_STORY: 'text-red-400',
  CONTENT_REMOVED: 'text-red-400',
  CONTENT_RESTORED: 'text-green-400',
};

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-white/5 last:border-b-0">
      <dt className="text-xs font-medium text-gray-500 shrink-0">{label}</dt>
      <dd className="text-sm text-white text-right min-w-0 break-all">
        {value}
      </dd>
    </div>
  );
}

export default function AuditLogTab() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 400);

  const actionFilterOptions = useMemo(
    () => [
      { value: '', label: t('admin.audit.filter_all_actions') },
      ...AUDIT_ACTION_KEYS.map((value) => ({
        value,
        label: t(`admin.audit.actions.${value}`),
      })),
    ],
    [t],
  );

  const formatActionLabel = (action: string) =>
    t(`admin.audit.actions.${action}`, {
      defaultValue: action.replace(/_/g, ' ').toLowerCase(),
    });

  const { data, isLoading } = useQuery<PaginatedResponse<AuditLogEntry>>({
    queryKey: ['admin', 'audit-logs', page, actionFilter, debouncedSearch],
    queryFn: () =>
      adminApi
        .getAuditLogs(page, 15, {
          action: actionFilter || undefined,
          search: debouncedSearch.trim() || undefined,
        })
        .then((r) => r.data),
  });

  const logs = data?.data ?? [];
  const selected = logs.find((l) => l.id === selectedId) ?? null;
  const hasActiveFilters = Boolean(actionFilter || debouncedSearch.trim());

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t('admin.audit.title')}
        subtitle={t('admin.audit.subtitle')}
      />

      <AdminFilterBar>
        <div className="flex-1 min-w-0">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder={t('admin.audit.search_placeholder')}
          />
        </div>
        <FilterDropdown
          label={t('admin.audit.filter_action')}
          value={actionFilter}
          onChange={(v) => {
            setActionFilter(v);
            setPage(1);
          }}
          options={actionFilterOptions}
        />
      </AdminFilterBar>

      <AdminSplitView
        hasSelection={!!selected}
        onBack={() => setSelectedId(null)}
        onClearSelection={() => setSelectedId(null)}
        listTitle={t('admin.audit.title')}
        list={
          <div className="flex flex-col h-full min-h-0">
            <div className="flex-1 overflow-y-auto space-y-2 pb-2">
              {isLoading ? (
                <AdminListSkeleton rows={6} />
              ) : logs.length === 0 ? (
                <AdminEmptyState
                  icon={Activity}
                  title={
                    hasActiveFilters
                      ? t('admin.audit.empty_filtered_title')
                      : t('admin.audit.empty_title')
                  }
                  description={
                    hasActiveFilters
                      ? t('admin.audit.empty_filtered_description')
                      : t('admin.audit.empty_description')
                  }
                  compact
                />
              ) : (
                logs.map((log) => (
                  <AdminListRow
                    key={log.id}
                    selected={selectedId === log.id}
                    onClick={() => setSelectedId(log.id)}
                    className={
                      selectedId === log.id
                        ? 'border-brand-primary/30 bg-brand-primary/10'
                        : undefined
                    }
                    title={
                      <span
                        className={`inline-flex items-center gap-1.5 ${ACTION_COLORS[log.action] || 'text-gray-300'}`}
                      >
                        <Activity size={14} />
                        {formatActionLabel(log.action)}
                      </span>
                    }
                    subtitle={
                      <span className="text-brand-primary font-semibold">
                        @{log.adminUsername}
                      </span>
                    }
                    badge={
                      <span className="px-2 py-0.5 bg-white/5 rounded text-xs font-semibold uppercase tracking-wider text-gray-300 border border-white/5">
                        {log.targetType}
                      </span>
                    }
                    meta={
                      <span>{new Date(log.createdAt).toLocaleString()}</span>
                    }
                  />
                ))
              )}
            </div>
            <div className="shrink-0">
              <Pagination meta={data?.meta} onPageChange={setPage} />
            </div>
          </div>
        }
        detail={
          selected ? (
            <div className="space-y-5 pb-6 px-0.5">
              <div>
                <p
                  className={`text-base font-semibold ${ACTION_COLORS[selected.action] || 'text-white'}`}
                >
                  {formatActionLabel(selected.action)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {new Date(selected.createdAt).toLocaleString()}
                </p>
              </div>
              <dl>
                <MetaRow
                  label={t('admin.audit.col_admin')}
                  value={`@${selected.adminUsername}`}
                />
                <MetaRow
                  label={t('admin.audit.col_type')}
                  value={selected.targetType}
                />
                <MetaRow
                  label={t('admin.audit.col_target')}
                  value={
                    <span className="font-mono text-xs text-gray-300">
                      {selected.targetId}
                    </span>
                  }
                />
              </dl>
              {selected.details && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    {t('admin.audit.col_details', 'Detalles')}
                  </p>
                  <pre className="text-xs text-gray-300 whitespace-pre-wrap break-all bg-white/[0.03] border border-white/5 rounded-lg p-3 font-mono leading-relaxed">
                    {selected.details}
                  </pre>
                </div>
              )}
            </div>
          ) : null
        }
      />
    </div>
  );
}
