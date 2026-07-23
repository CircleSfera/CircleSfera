import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertOctagon,
  Bot,
  Check,
  Gavel,
  Ghost,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AdminReport } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import ConfirmModal from '../modals/ConfirmModal';
import { Button } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminListSkeleton } from './AdminSkeletons';
import { AdminSplitView } from './AdminSplitView';
import {
  ActionButton,
  FilterDropdown,
  Pagination,
  SearchInput,
} from './AdminTable';

function timeAgo(
  date: string | Date,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const now = Date.now();
  const d = new Date(date).getTime();
  const diff = Math.max(0, now - d);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t('admin.shared.time_ago_now');
  if (mins < 60) return t('admin.shared.time_ago_minutes', { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('admin.shared.time_ago_hours', { count: hrs });
  const days = Math.floor(hrs / 24);
  if (days < 7) return t('admin.shared.time_ago_days', { count: days });
  return new Date(date).toLocaleDateString();
}

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export default function ReportsTab({ onToast }: Props) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('PENDING'); // Default to pending for moderation flow
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const debouncedSearch = useDebouncedValue(search, 400);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<PaginatedResponse<AdminReport>>({
    queryKey: ['admin', 'reports', page, debouncedSearch, statusFilter],
    queryFn: () =>
      adminApi
        .getReports(
          page,
          10,
          debouncedSearch || undefined,
          statusFilter || undefined,
        )
        .then((res) => res.data as PaginatedResponse<AdminReport>),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminApi.updateReport(id, status),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      if (selectedReportId === variables.id) setSelectedReportId(null);
      onToast(t('admin.reports.toast_updated'), 'success');
    },
    onError: () => onToast(t('admin.reports.toast_update_error'), 'error'),
  });

  const penaltyMutation = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: 'IGNORE' | 'STRIKE' | 'BAN';
    }) => adminApi.resolveReportWithPenalty(id, action),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      if (selectedReportId === variables.id) setSelectedReportId(null);
      const msgs = {
        IGNORE: t('admin.reports.toast_ignore'),
        STRIKE: t('admin.reports.toast_strike'),
        BAN: t('admin.reports.toast_ban'),
      };
      onToast(msgs[variables.action], 'success');
    },
    onError: () => onToast(t('admin.reports.toast_penalty_error'), 'error'),
  });

  const bulkMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: string }) =>
      adminApi.bulkUpdateReports(ids, status),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'trust-queue'] });
      setSelectedIds(new Set());
      setSelectedReportId(null);
      const msgKey =
        variables.status === 'RESOLVED'
          ? 'admin.reports.toast_bulk_resolved'
          : 'admin.reports.toast_bulk_dismissed';
      onToast(t(msgKey, { count: variables.ids.length }), 'success');
    },
    onError: () => onToast(t('admin.reports.toast_bulk_error'), 'error'),
  });

  const reports = data?.data ?? [];
  const selectedReport = reports.find((r) => r.id === selectedReportId);

  const isFiltered =
    debouncedSearch.length > 0 ||
    (statusFilter !== '' && statusFilter !== 'PENDING');

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('PENDING');
    setPage(1);
    setSelectedReportId(null);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string, e: React.SyntheticEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === reports.length && reports.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(reports.map((r) => r.id)));
    }
  };

  const isUserOrMessageTarget = (type: string) =>
    type === 'USER' || type === 'MESSAGE';

  return (
    <div className="flex flex-col min-h-0 gap-4">
      <AdminPageHeader
        title={t('admin.reports.title')}
        subtitle={t('admin.reports.subtitle')}
      />

      <AdminFilterBar>
        <div className="flex-1 min-w-0">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder={t('admin.reports.search_placeholder')}
          />
        </div>
        <FilterDropdown
          label={t('admin.reports.filter_status')}
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            setPage(1);
            setSelectedReportId(null);
          }}
          options={[
            { value: '', label: t('admin.reports.status_all') },
            { value: 'PENDING', label: t('admin.reports.status_pending') },
            { value: 'RESOLVED', label: t('admin.reports.status_resolved') },
            { value: 'REJECTED', label: t('admin.reports.status_rejected') },
          ]}
        />
      </AdminFilterBar>

      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="flex flex-wrap items-center gap-2 px-3 py-2 border border-white/5 bg-white/[0.02] rounded-lg shrink-0"
          >
            <span className="px-2 sm:px-3 text-sm font-semibold text-white">
              {t('admin.shared.selected_count', { count: selectedIds.size })}
            </span>
            <ActionButton
              onClick={() =>
                bulkMutation.mutate({
                  ids: Array.from(selectedIds),
                  status: 'REJECTED',
                })
              }
              label={t('admin.reports.bulk_ignore')}
              variant="ghost"
              icon={X}
              disabled={bulkMutation.isPending}
            />
            <ActionButton
              onClick={() =>
                bulkMutation.mutate({
                  ids: Array.from(selectedIds),
                  status: 'RESOLVED',
                })
              }
              label={t('admin.reports.bulk_resolve')}
              variant="success"
              icon={Check}
              disabled={bulkMutation.isPending}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AdminSplitView
        hasSelection={!!selectedReportId}
        onBack={() => setSelectedReportId(null)}
        onClearSelection={() => setSelectedReportId(null)}
        listTitle={t('admin.reports.list_title')}
        list={
          <div className="flex flex-col h-full min-h-0">
            <div className="p-3 border-b border-white/5 shrink-0 flex items-center gap-3">
              <input
                type="checkbox"
                className="rounded border-white/20 bg-white/5 text-brand-primary focus:ring-brand-primary/50"
                checked={
                  selectedIds.size === reports.length && reports.length > 0
                }
                onChange={toggleSelectAll}
              />
              <h3 className="font-semibold text-white text-sm">
                {t('admin.shared.select_all')}
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pb-2">
              {isLoading ? (
                <AdminListSkeleton rows={5} />
              ) : reports.length === 0 ? (
                <AdminEmptyState
                  icon={Check}
                  title={
                    isFiltered
                      ? t('admin.reports.empty_filtered_title')
                      : t('admin.reports.empty_title')
                  }
                  description={
                    isFiltered
                      ? t('admin.reports.empty_filtered_description')
                      : t('admin.reports.empty_description')
                  }
                  action={
                    isFiltered ? (
                      <Button
                        onClick={clearFilters}
                        variant="secondary"
                        className="min-h-11"
                      >
                        {t('admin.shared.clear_filters')}
                      </Button>
                    ) : undefined
                  }
                  compact
                />
              ) : (
                reports.map((report) => (
                  <AdminListRow
                    key={report.id}
                    onClick={() => setSelectedReportId(report.id)}
                    className={
                      selectedReportId === report.id
                        ? 'border-brand-primary/30 bg-brand-primary/10'
                        : undefined
                    }
                    title={`@${report.targetContent?.author || t('admin.shared.unknown')}`}
                    subtitle={report.targetType}
                    badge={
                      <span className="text-xs font-semibold uppercase tracking-wide text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">
                        {report.reason}
                      </span>
                    }
                    meta={timeAgo(report.createdAt, t)}
                    avatar={
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1 rounded border-white/20 bg-white/5 text-brand-primary focus:ring-brand-primary/50"
                          checked={selectedIds.has(report.id)}
                          onChange={(e) => toggleSelect(report.id, e)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="w-10 h-10 rounded-lg bg-white/5 overflow-hidden shrink-0">
                          {report.targetContent?.thumbnail ? (
                            <img
                              src={report.targetContent.thumbnail}
                              className="w-full h-full object-cover"
                              alt=""
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-700">
                              <Ghost size={16} />
                            </div>
                          )}
                        </div>
                      </div>
                    }
                  />
                ))
              )}
            </div>

            <div className="shrink-0 pt-2 border-t border-white/5">
              <Pagination meta={data?.meta} onPageChange={setPage} />
            </div>
          </div>
        }
        detail={
          <AnimatePresence mode="wait">
            {selectedReport ? (
              <motion.div
                key={selectedReport.id}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col h-full"
              >
                {/* Header Action Bar */}
                <div className="p-4 border-b border-white/5 flex flex-col gap-3 shrink-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2 flex-wrap">
                        {t('admin.reports.detail_title')}
                        {selectedReport.targetType !== 'MESSAGE' && (
                          <button
                            type="button"
                            onClick={() => {
                              if (selectedReport.targetType === 'POST')
                                window.open(
                                  `/p/${selectedReport.targetId}`,
                                  '_blank',
                                );
                              if (
                                selectedReport.targetType === 'USER' &&
                                selectedReport.targetContent?.author
                              )
                                window.open(
                                  `/${selectedReport.targetContent.author}`,
                                  '_blank',
                                );
                            }}
                            className="text-xs font-semibold bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 px-2 py-1 rounded transition-colors min-h-6"
                          >
                            {t('admin.reports.view_original')}
                          </button>
                        )}
                      </h3>
                      <p className="text-xs text-gray-400 truncate">
                        ID: {selectedReport.id}
                      </p>
                    </div>
                  </div>
                  {selectedReport.status === 'PENDING' && (
                    <div className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-row sm:flex-wrap">
                      {selectedReport.targetType === 'USER' &&
                      selectedReport.details?.includes('[URGENT]') ? (
                        <>
                          <Button
                            onClick={() =>
                              penaltyMutation.mutate({
                                id: selectedReport.id,
                                action: 'IGNORE',
                              })
                            }
                            isLoading={penaltyMutation.isPending}
                            variant="secondary"
                            className="text-xs sm:text-sm font-semibold border-white/5 min-h-10 sm:min-h-11 px-2 sm:px-4"
                          >
                            <X size={16} className="mr-1 sm:mr-2 shrink-0" />{' '}
                            <span className="truncate">
                              {t('admin.reports.ignore')}
                            </span>
                          </Button>
                          <Button
                            onClick={() =>
                              penaltyMutation.mutate({
                                id: selectedReport.id,
                                action: 'STRIKE',
                              })
                            }
                            isLoading={penaltyMutation.isPending}
                            className="bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30 border border-yellow-500/50 text-xs sm:text-sm font-semibold min-h-10 sm:min-h-11 px-2 sm:px-4"
                          >
                            <Gavel
                              size={16}
                              className="mr-1 sm:mr-2 shrink-0"
                            />{' '}
                            <span className="truncate">
                              {t('admin.reports.strike')}
                            </span>
                          </Button>
                          <Button
                            onClick={() =>
                              setConfirmModal({
                                isOpen: true,
                                title: t('admin.reports.confirm_ban_title'),
                                message: t('admin.reports.confirm_ban_message'),
                                onConfirm: () => {
                                  penaltyMutation.mutate({
                                    id: selectedReport.id,
                                    action: 'BAN',
                                  });
                                  setConfirmModal((prev) => ({
                                    ...prev,
                                    isOpen: false,
                                  }));
                                },
                              })
                            }
                            isLoading={penaltyMutation.isPending}
                            variant="danger"
                            className="text-xs sm:text-sm font-semibold border-red-500/30 min-h-10 sm:min-h-11 px-2 sm:px-4"
                          >
                            <AlertOctagon
                              size={16}
                              className="mr-1 sm:mr-2 shrink-0"
                            />{' '}
                            <span className="truncate">
                              {t('admin.reports.ban')}
                            </span>
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            onClick={() =>
                              updateMutation.mutate({
                                id: selectedReport.id,
                                status: 'REJECTED',
                              })
                            }
                            isLoading={updateMutation.isPending}
                            variant="secondary"
                            className="text-xs sm:text-sm font-semibold border-white/5 min-h-10 sm:min-h-11 px-2 sm:px-4"
                          >
                            <X size={16} className="mr-1 sm:mr-2 shrink-0" />{' '}
                            <span className="truncate">
                              {t('admin.reports.ignore')}
                            </span>
                          </Button>
                          <Button
                            onClick={() =>
                              setConfirmModal({
                                isOpen: true,
                                title: t('admin.reports.confirm_delete_title'),
                                message: t(
                                  'admin.reports.confirm_delete_message',
                                ),
                                onConfirm: () => {
                                  const deleteFn =
                                    selectedReport.targetType.toUpperCase() ===
                                    'POST'
                                      ? adminApi.deletePost
                                      : selectedReport.targetType.toUpperCase() ===
                                          'STORY'
                                        ? adminApi.deleteStory
                                        : adminApi.deleteComment;
                                  deleteFn(selectedReport.targetId)
                                    .then(() => {
                                      updateMutation.mutate({
                                        id: selectedReport.id,
                                        status: 'RESOLVED',
                                      });
                                      onToast(
                                        t(
                                          'admin.reports.toast_content_deleted',
                                        ),
                                        'success',
                                      );
                                    })
                                    .catch(() =>
                                      onToast(
                                        t('admin.reports.toast_delete_error'),
                                        'error',
                                      ),
                                    );
                                  setConfirmModal((prev) => ({
                                    ...prev,
                                    isOpen: false,
                                  }));
                                },
                              })
                            }
                            isLoading={updateMutation.isPending}
                            variant="danger"
                            className="text-xs sm:text-sm font-semibold border-red-500/30 min-h-10 sm:min-h-11 px-2 sm:px-4 col-span-2 sm:col-span-1"
                          >
                            <Trash2
                              size={16}
                              className="mr-1 sm:mr-2 shrink-0"
                            />{' '}
                            <span className="truncate">
                              {t('admin.reports.delete_content')}
                            </span>
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5 flex flex-col lg:flex-row gap-5">
                  <div className="w-full lg:w-1/2 flex flex-col gap-4">
                    {isUserOrMessageTarget(selectedReport.targetType) ? (
                      <div className="flex flex-col gap-4 min-h-[200px]">
                        {selectedReport.targetContent?.thumbnail && (
                          <div className="w-16 h-16 rounded-full overflow-hidden mx-auto">
                            <img
                              src={selectedReport.targetContent.thumbnail}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="text-center space-y-1">
                          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                            {selectedReport.targetType === 'USER'
                              ? t('admin.reports.target_user')
                              : t('admin.reports.target_message')}
                          </p>
                          {selectedReport.targetContent?.author && (
                            <p className="text-brand-primary font-semibold">
                              @{selectedReport.targetContent.author}
                            </p>
                          )}
                        </div>
                        {selectedReport.targetContent?.text && (
                          <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                            {selectedReport.targetContent.text}
                          </p>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="bg-black/40 rounded-lg flex-1 min-h-[240px] sm:min-h-[280px] flex items-center justify-center overflow-hidden">
                          {selectedReport.targetContent?.thumbnail ? (
                            <img
                              src={selectedReport.targetContent.thumbnail}
                              className="w-full h-full object-contain max-h-[min(60vh,28rem)]"
                              alt="Reported content"
                            />
                          ) : (
                            <div className="text-gray-600 flex flex-col items-center">
                              <Ghost size={48} className="mb-4" />
                              <p className="text-sm font-semibold">
                                {t('admin.reports.no_preview')}
                              </p>
                            </div>
                          )}
                        </div>
                        {selectedReport.targetContent?.text && (
                          <p className="text-sm text-gray-300 italic whitespace-pre-wrap leading-relaxed">
                            &ldquo;{selectedReport.targetContent.text}&rdquo;
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  <div className="w-full lg:w-1/2">
                    <dl className="text-sm">
                      <div className="flex items-start justify-between gap-3 py-2.5 border-b border-white/5">
                        <dt className="text-xs font-medium text-gray-500 shrink-0 pt-0.5">
                          {t('admin.reports.reason_label')}
                        </dt>
                        <dd className="text-red-400 font-semibold text-right">
                          {selectedReport.reason}
                        </dd>
                      </div>
                      <div className="flex items-start justify-between gap-3 py-2.5 border-b border-white/5">
                        <dt className="text-xs font-medium text-gray-500 shrink-0 pt-0.5">
                          {t('admin.reports.reported_by_label')}
                        </dt>
                        <dd className="text-white font-semibold text-right">
                          {selectedReport.details?.includes(
                            '[AI Automated Flag]',
                          ) ? (
                            <span className="inline-flex items-center gap-1.5 text-brand-primary">
                              <Bot size={14} /> {t('admin.reports.ai_reporter')}
                            </span>
                          ) : (
                            <>
                              @
                              {selectedReport.reporter?.profile?.username ||
                                t('admin.shared.anonymous')}
                            </>
                          )}
                        </dd>
                      </div>
                      {selectedReport.details && (
                        <div className="py-2.5 border-b border-white/5">
                          <dt className="text-xs font-medium text-gray-500 mb-1.5">
                            {t('admin.reports.details_label')}
                          </dt>
                          <dd className="text-sm text-gray-300 whitespace-pre-wrap">
                            {selectedReport.details.replace(
                              '[AI Automated Flag]: ',
                              '',
                            )}
                          </dd>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-3 py-2.5">
                        <dt className="text-xs font-medium text-gray-500">
                          {t('admin.reports.status_label')}
                        </dt>
                        <dd>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wide ${
                              selectedReport.status === 'PENDING'
                                ? 'bg-yellow-500/15 text-yellow-500'
                                : selectedReport.status === 'RESOLVED'
                                  ? 'bg-green-500/15 text-green-400'
                                  : 'bg-white/10 text-gray-300'
                            }`}
                          >
                            {selectedReport.status}
                          </span>
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 flex items-center justify-center p-6"
              >
                <AdminEmptyState
                  icon={Check}
                  title={t('admin.reports.detail_empty_title')}
                  description={t('admin.reports.detail_empty_description')}
                />
              </motion.div>
            )}
          </AnimatePresence>
        }
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={t('admin.shared.confirm')}
        cancelText={t('admin.shared.cancel')}
        isDestructive={true}
      />
    </div>
  );
}
