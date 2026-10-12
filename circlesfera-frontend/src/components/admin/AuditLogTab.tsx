import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AuditLogEntry } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import { formatDateTime } from '../../utils/format';
import { Button } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminListSkeleton } from './AdminSkeletons';
import { AdminSplitView } from './AdminSplitView';
import { FilterDropdown, Pagination, SearchInput } from './AdminTable';
import {
  AdminUserFilterChip,
  useAdminQueueUserFilter,
} from './AdminUserFilterChip';

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
  DEMOTE_USER: 'text-white/70',
  REPORT_RESOLVED: 'text-green-400',
  REPORT_DISMISSED: 'text-white/70',
  DELETE_COMMENT: 'text-red-400',
  DELETE_STORY: 'text-red-400',
  CONTENT_REMOVED: 'text-red-400',
  CONTENT_RESTORED: 'text-green-400',
};

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-white/5 last:border-b-0">
      <dt className="text-xs font-medium text-white/50 shrink-0">{label}</dt>
      <dd className="text-sm text-white text-right min-w-0 break-all">
        {value}
      </dd>
    </div>
  );
}

export default function AuditLogTab() {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The two exact questions of the log: what was done to an account, taken
  // from the address like the other lists, and what a staff member did.
  const { userId, username, clearUserFilter } = useAdminQueueUserFilter();
  const [searchParams, setSearchParams] = useSearchParams();
  const [staff, setStaff] = useState<{ id: string; name: string } | null>(null);
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
      // An action with no text yet: its stored name, readable.
      defaultValue: action.replace(/_/g, ' ').toLowerCase(),
    });

  const { data, isLoading } = useQuery<PaginatedResponse<AuditLogEntry>>({
    queryKey: [
      'admin',
      'audit-logs',
      page,
      actionFilter,
      debouncedSearch,
      staff?.id,
      userId,
    ],
    queryFn: () =>
      adminApi
        .getAuditLogs(page, 15, {
          action: actionFilter || undefined,
          search: debouncedSearch.trim() || undefined,
          adminId: staff?.id,
          userId,
        })
        .then((r) => r.data),
  });

  const logs = data?.data ?? [];
  const selected = logs.find((l) => l.id === selectedId) ?? null;
  const hasActiveFilters = Boolean(
    actionFilter || debouncedSearch.trim() || staff || userId,
  );
  const showAccount = (accountId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('userId', accountId);
    setSearchParams(next, { replace: true });
    setPage(1);
    setSelectedId(null);
  };

  return (
    <div className="space-y-2.5">
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
        {userId && (
          <AdminUserFilterChip
            username={username}
            onClear={() => {
              clearUserFilter();
              setPage(1);
            }}
          />
        )}
        {staff && (
          <AdminUserFilterChip
            label={t('admin.audit.staff_chip', { name: staff.name })}
            clearLabel={t('admin.audit.clear_staff')}
            onClear={() => {
              setStaff(null);
              setPage(1);
            }}
          />
        )}
      </AdminFilterBar>

      <AdminSplitView
        hasSelection={!!selected}
        onBack={() => setSelectedId(null)}
        onClearSelection={() => setSelectedId(null)}
        listAriaLabel={t('admin.audit.title')}
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
                    title={
                      <span
                        className={`inline-flex items-center gap-1.5 ${ACTION_COLORS[log.action] || 'text-white/70'}`}
                      >
                        <Activity size={14} />
                        {formatActionLabel(log.action)}
                      </span>
                    }
                    subtitle={
                      <span className="text-brand-primary-text font-semibold">
                        @{log.adminUsername}
                      </span>
                    }
                    badge={
                      <span className="px-2 py-0.5 bg-white/5 rounded text-xs font-semibold uppercase tracking-wider text-white/70 border border-white/5">
                        {t(
                          `admin.audit.targets.${log.targetType.toUpperCase()}`,
                          { defaultValue: log.targetType },
                        )}
                      </span>
                    }
                    meta={
                      <span>
                        {formatDateTime(log.createdAt, i18n.language)}
                      </span>
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
            <div className="space-y-2.5 sm:space-y-3 pb-4 sm:pb-6 px-0.5">
              <div>
                <p
                  className={`text-base font-semibold ${ACTION_COLORS[selected.action] || 'text-white'}`}
                >
                  {formatActionLabel(selected.action)}
                </p>
                <p className="text-xs text-white/50 mt-1">
                  {formatDateTime(selected.createdAt, i18n.language)}
                </p>
              </div>
              <dl>
                <MetaRow
                  label={t('admin.audit.col_admin')}
                  value={`@${selected.adminUsername}`}
                />
                <MetaRow
                  label={t('admin.audit.col_type')}
                  value={t(
                    `admin.audit.targets.${selected.targetType.toUpperCase()}`,
                    { defaultValue: selected.targetType },
                  )}
                />
                <MetaRow
                  label={t('admin.audit.col_target')}
                  value={
                    <span className="font-mono text-xs text-white/70">
                      {selected.targetId}
                    </span>
                  }
                />
              </dl>
              {/* From one entry to everything by its author or about its
                  account. */}
              <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                {selected.adminId && staff?.id !== selected.adminId && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11 sm:min-h-9 text-xs"
                    onClick={() => {
                      setStaff({
                        id: selected.adminId as string,
                        name: selected.adminUsername,
                      });
                      setPage(1);
                      setSelectedId(null);
                    }}
                  >
                    {t('admin.audit.by_staff')}
                  </Button>
                )}
                {selected.targetType.toLowerCase() === 'user' &&
                  userId !== selected.targetId && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-11 sm:min-h-9 text-xs"
                      onClick={() => showAccount(selected.targetId)}
                    >
                      {t('admin.audit.about_account')}
                    </Button>
                  )}
              </div>
              {selected.details && (
                <div>
                  <p className="text-[11px] font-semibold text-white/50 uppercase tracking-wide mb-2">
                    {t('admin.audit.col_details')}
                  </p>
                  <pre className="text-xs text-white/70 whitespace-pre-wrap break-all bg-white/3 border border-white/5 rounded-lg p-3 font-mono leading-relaxed">
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
