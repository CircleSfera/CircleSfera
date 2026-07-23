import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AuditLogEntry } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminList, AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { FilterDropdown, Pagination, SearchInput, Table } from './AdminTable';

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

export default function AuditLogTab() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [search, setSearch] = useState('');
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

      <div className="rounded-xl border border-white/10 overflow-x-auto">
        <AdminList
          loading={isLoading}
          isEmpty={!logs.length}
          emptyIcon={Activity}
          emptyTitle={
            hasActiveFilters
              ? t('admin.audit.empty_filtered_title')
              : t('admin.audit.empty_title')
          }
          emptyDescription={
            hasActiveFilters
              ? t('admin.audit.empty_filtered_description')
              : t('admin.audit.empty_description')
          }
          mobile={
            <div className="space-y-2">
              {logs.map((log) => (
                <AdminListRow
                  key={log.id}
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
                    <span className="px-2 py-0.5 bg-white/5 rounded text-xs font-semibold uppercase tracking-wider text-gray-300 border border-white/10">
                      {log.targetType}
                    </span>
                  }
                  meta={<span>{new Date(log.createdAt).toLocaleString()}</span>}
                />
              ))}
            </div>
          }
          desktop={
            <Table
              headers={[
                t('admin.audit.col_date'),
                t('admin.audit.col_admin'),
                t('admin.audit.col_action'),
                t('admin.audit.col_type'),
                t('admin.audit.col_target'),
              ]}
              columnWidths={[
                'whitespace-nowrap',
                'min-w-28',
                'min-w-36',
                'whitespace-nowrap',
                'min-w-32',
              ]}
              loading={false}
              isEmpty={false}
            >
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="hover:bg-white/[0.07] transition-colors border-b border-white/5 last:border-0"
                >
                  <td className="px-3 py-2.5 text-gray-300 text-sm whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-brand-primary font-semibold text-sm truncate block max-w-32">
                      @{log.adminUsername}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <Activity
                        size={14}
                        className={`shrink-0 ${ACTION_COLORS[log.action] || 'text-gray-300'}`}
                      />
                      <span
                        className={`text-sm font-medium truncate ${ACTION_COLORS[log.action] || 'text-gray-300'}`}
                        title={formatActionLabel(log.action)}
                      >
                        {formatActionLabel(log.action)}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="px-2 py-0.5 bg-white/5 rounded text-xs font-semibold uppercase tracking-wider text-gray-300 border border-white/10">
                      {log.targetType}
                    </span>
                  </td>
                  <td
                    className="px-3 py-2.5 text-gray-600 text-xs font-mono max-w-40 truncate"
                    title={log.targetId}
                  >
                    {log.targetId}
                  </td>
                </tr>
              ))}
            </Table>
          }
        />
        <div className="p-2 border-t border-white/5">
          <Pagination meta={data?.meta} onPageChange={setPage} />
        </div>
      </div>
    </div>
  );
}
