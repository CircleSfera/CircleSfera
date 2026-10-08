import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle,
  ExternalLink,
  LifeBuoy,
  Mail,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminSupportTicket } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import { formatDate, formatDateTime } from '../../utils/format';
import ConfirmModal from '../modals/ConfirmModal';
import { Button, Textarea } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminListSkeleton } from './AdminSkeletons';
import { AdminSplitView } from './AdminSplitView';
import { FilterDropdown, Pagination } from './AdminTable';
import { staffTabHref } from './adminNav';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

type TicketStatus = 'OPEN' | 'RESOLVED' | 'CLOSED';
type ShownStatus = TicketStatus | 'ESCALATED';

function statusBadgeClass(status: ShownStatus) {
  switch (status) {
    case 'OPEN':
      return 'bg-yellow-500/20 text-yellow-500';
    case 'RESOLVED':
      return 'bg-green-500/20 text-green-500';
    case 'CLOSED':
      return 'bg-white/10 text-white/50';
    case 'ESCALATED':
      return 'bg-brand-primary/20 text-brand-primary';
  }
}

const HOUR_MS = 60 * 60 * 1000;

/** How long an open ticket has waited for an answer; marked after two days. */
function WaitingTime({ since }: { since: string }) {
  const { t } = useTranslation();
  const hours = Math.max(
    0,
    Math.floor((Date.now() - new Date(since).getTime()) / HOUR_MS),
  );
  return (
    <span className={hours >= 48 ? 'font-semibold text-yellow-400' : undefined}>
      {hours < 1
        ? t('admin.support.waiting_under_hour')
        : hours < 24
          ? t('admin.support.waiting_hours', { count: hours })
          : t('admin.support.waiting_days', { count: Math.floor(hours / 24) })}
    </span>
  );
}

export default function SupportTicketsTab({ onToast }: Props) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmEscalate, setConfirmEscalate] = useState(false);

  const { data, isLoading } = useQuery<PaginatedResponse<AdminSupportTicket>>({
    queryKey: ['admin', 'support-tickets', page, statusFilter],
    queryFn: () =>
      adminApi
        .getSupportTickets(page, 20, statusFilter || undefined)
        .then((res) => res.data as PaginatedResponse<AdminSupportTicket>),
  });

  const selectedTicket = data?.data.find((t) => t.id === selectedTicketId);

  useEffect(() => {
    setReply(selectedTicket?.reply ?? '');
  }, [selectedTicket?.reply]);

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      status,
      replyText,
    }: {
      id: string;
      status?: TicketStatus;
      replyText?: string;
    }) =>
      adminApi.updateSupportTicket(id, {
        status,
        reply: replyText,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'support-tickets'] });
      if (variables.status === 'CLOSED') {
        setSelectedTicketId(null);
      }
      onToast(t('admin.support.toast_updated'), 'success');
    },
    onError: () => onToast(t('admin.support.toast_error'), 'error'),
  });

  const escalateMutation = useMutation({
    mutationFn: (id: string) => adminApi.escalateSupportTicket(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'support-tickets'] });
      onToast(t('admin.support.toast_escalated'), 'success');
    },
    onError: () => onToast(t('admin.support.toast_error'), 'error'),
  });

  // With moderation: handed over, and its report not decided yet. Support
  // cannot answer or close it meanwhile.
  const withModeration =
    selectedTicket?.status === 'ESCALATED' &&
    ['PENDING', 'REVIEWING'].includes(
      selectedTicket.escalatedReport?.status ?? 'PENDING',
    );

  const { data: account } = useQuery({
    queryKey: ['admin', 'support-account', selectedTicket?.id],
    queryFn: () =>
      adminApi
        .getSupportTicketAccount(selectedTicket?.id as string)
        .then((res) => res.data),
    enabled: !!selectedTicket?.id,
  });

  const handleStatusChange = (status: TicketStatus) => {
    if (!selectedTicket) return;

    if (status === 'CLOSED' && !reply.trim() && !selectedTicket.reply) {
      setConfirmClose(true);
      return;
    }

    updateMutation.mutate({
      id: selectedTicket.id,
      status,
      replyText: reply.trim() || undefined,
    });
  };

  const handleSaveReply = () => {
    if (!selectedTicket) return;
    updateMutation.mutate({
      id: selectedTicket.id,
      replyText: reply.trim(),
    });
  };

  const isFiltered = statusFilter !== '';

  return (
    <div className="flex flex-col min-h-0 gap-4">
      <AdminPageHeader
        title={t('admin.support.title')}
        subtitle={t('admin.support.subtitle')}
      />

      <AdminFilterBar>
        <FilterDropdown
          label={t('admin.support.filter_status')}
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            setPage(1);
            setSelectedTicketId(null);
          }}
          options={[
            { value: '', label: t('admin.support.status_all') },
            { value: 'OPEN', label: t('admin.support.status_open') },
            { value: 'RESOLVED', label: t('admin.support.status_resolved') },
            { value: 'CLOSED', label: t('admin.support.status_closed') },
            {
              value: 'ESCALATED',
              label: t('admin.support.status_escalated'),
            },
          ]}
        />
      </AdminFilterBar>

      <AdminSplitView
        hasSelection={!!selectedTicketId}
        onBack={() => setSelectedTicketId(null)}
        onClearSelection={() => setSelectedTicketId(null)}
        listTitle={t('admin.support.list_title')}
        list={
          <div className="flex flex-col h-full min-h-0">
            <div className="flex-1 overflow-y-auto space-y-2 pb-2">
              {isLoading ? (
                <AdminListSkeleton rows={5} />
              ) : !data || data.data.length === 0 ? (
                <AdminEmptyState
                  icon={LifeBuoy}
                  title={
                    isFiltered
                      ? t('admin.support.empty_filtered_title')
                      : t('admin.support.empty_title')
                  }
                  description={
                    isFiltered
                      ? t('admin.support.empty_filtered_description')
                      : t('admin.support.empty_description')
                  }
                  compact
                />
              ) : (
                data.data.map((ticket) => (
                  <AdminListRow
                    key={ticket.id}
                    onClick={() => setSelectedTicketId(ticket.id)}
                    className={
                      selectedTicketId === ticket.id
                        ? 'border-brand-primary/30 bg-brand-primary/10'
                        : undefined
                    }
                    title={ticket.subject}
                    subtitle={ticket.email}
                    badge={
                      <span
                        className={`text-xs font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${statusBadgeClass(ticket.status)}`}
                      >
                        {ticket.status === 'ESCALATED'
                          ? t('admin.support.status_escalated')
                          : ticket.status}
                      </span>
                    }
                    meta={
                      ticket.status === 'OPEN' ? (
                        <WaitingTime since={ticket.createdAt} />
                      ) : (
                        formatDate(ticket.createdAt, i18n.language)
                      )
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
            {selectedTicket ? (
              <motion.div
                key={selectedTicket.id}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col h-full"
              >
                <div className="p-4 border-b border-white/5 flex flex-col gap-3 shrink-0">
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg font-semibold text-white truncate">
                      {selectedTicket.subject}
                    </h3>
                    <p className="text-xs text-white/50 truncate">
                      ID: {selectedTicket.id}
                    </p>
                  </div>
                  {withModeration && (
                    <div className="rounded-xl border border-brand-primary/30 bg-brand-primary/10 p-3 text-sm text-white/85">
                      <p>{t('admin.support.with_moderation_notice')}</p>
                      <a
                        href={staffTabHref('reports')}
                        className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-primary hover:underline"
                      >
                        {t('admin.support.view_reports')}
                        <ExternalLink size={14} aria-hidden />
                      </a>
                    </div>
                  )}
                  {selectedTicket.status === 'ESCALATED' && !withModeration && (
                    <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/85">
                      {t('admin.support.moderation_decided')}
                    </p>
                  )}
                  {selectedTicket.status !== 'CLOSED' && !withModeration && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => handleStatusChange('RESOLVED')}
                        isLoading={updateMutation.isPending}
                        className="bg-green-500/20 text-green-500 hover:bg-green-500/30 border border-green-500/50 text-xs sm:text-sm font-semibold min-h-10 sm:min-h-11"
                      >
                        <CheckCircle size={16} className="mr-2 shrink-0" />
                        {t('admin.support.mark_resolved')}
                      </Button>
                      <Button
                        onClick={() => handleStatusChange('CLOSED')}
                        isLoading={updateMutation.isPending}
                        variant="secondary"
                        className="text-xs sm:text-sm font-semibold border-white/5 min-h-10 sm:min-h-11"
                      >
                        <XCircle size={16} className="mr-2 shrink-0" />
                        {t('admin.support.mark_closed')}
                      </Button>
                      {selectedTicket.status === 'OPEN' && (
                        <Button
                          onClick={() => setConfirmEscalate(true)}
                          isLoading={escalateMutation.isPending}
                          variant="secondary"
                          className="text-xs sm:text-sm font-semibold border-white/5 min-h-10 sm:min-h-11"
                        >
                          <ShieldAlert size={16} className="mr-2 shrink-0" />
                          {t('admin.support.hand_to_moderation')}
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5 sm:p-3 space-y-3">
                  <dl className="text-sm">
                    <div className="py-2.5 border-b border-white/5">
                      <dt className="text-xs font-medium text-white/40 mb-1">
                        {t('admin.support.email_label')}
                      </dt>
                      <dd className="text-white font-semibold flex items-center gap-2">
                        <Mail size={14} className="text-white/40 shrink-0" />
                        {selectedTicket.email}
                      </dd>
                      {selectedTicket.user?.profile?.username && (
                        <dd className="text-xs text-white/50 mt-1">
                          @{selectedTicket.user?.profile?.username}
                        </dd>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-white/5">
                      <dt className="text-xs font-medium text-white/40">
                        {t('admin.support.status_label')}
                      </dt>
                      <dd>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wide ${statusBadgeClass(selectedTicket.status)}`}
                        >
                          {selectedTicket.status === 'ESCALATED'
                            ? t('admin.support.status_escalated')
                            : selectedTicket.status}
                        </span>
                      </dd>
                    </div>
                  </dl>
                  <p className="text-xs text-white/40">
                    {t('admin.support.created_at', {
                      date: formatDateTime(
                        selectedTicket.createdAt,
                        i18n.language,
                      ),
                    })}
                  </p>

                  {account && (
                    <section
                      aria-label={t('admin.support.account.title')}
                      className="rounded-xl border border-white/10 bg-white/3 p-3"
                    >
                      <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wide mb-2">
                        {t('admin.support.account.title')}
                      </p>
                      <dl className="space-y-1.5 text-sm">
                        <div className="flex justify-between gap-3">
                          <dt className="text-white/50">
                            {t('admin.support.account.plan')}
                          </dt>
                          <dd className="font-semibold text-white">
                            {account.plan
                              ? account.plan.name
                              : t('admin.support.account.no_plan')}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-white/50">
                            {t('admin.support.account.identity')}
                          </dt>
                          <dd className="font-semibold text-white">
                            {account.identityVerified
                              ? t('admin.support.account.yes')
                              : t('admin.support.account.no')}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-white/50">
                            {t('admin.support.account.payouts')}
                          </dt>
                          <dd className="font-semibold text-white">
                            {account.payouts.enabled
                              ? t('admin.support.account.payouts_enabled')
                              : account.payouts.connected
                                ? t('admin.support.account.payouts_pending')
                                : t('admin.support.account.payouts_none')}
                          </dd>
                        </div>
                      </dl>
                      <ul className="mt-2 space-y-1 border-t border-white/5 pt-2 text-sm">
                        {account.profiles.map((profile) => (
                          <li
                            key={profile.id}
                            className="flex justify-between gap-3"
                          >
                            <span className="truncate text-white/70">
                              @{profile.username}
                            </span>
                            <span
                              className={
                                profile.banned || profile.suspended
                                  ? 'font-semibold text-brand-secondary'
                                  : 'font-semibold text-white'
                              }
                            >
                              {profile.banned
                                ? t('admin.support.account.banned')
                                : profile.suspended
                                  ? t('admin.support.account.suspended')
                                  : t('admin.support.account.in_good_standing')}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  <div>
                    <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wide mb-2">
                      {t('admin.support.message_label')}
                    </p>
                    <p className="text-sm text-white/70 whitespace-pre-wrap leading-relaxed">
                      {selectedTicket.message}
                    </p>
                  </div>

                  <div className="space-y-3 pt-1 border-t border-white/5">
                    <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wide">
                      {t('admin.support.reply_label')}
                    </p>
                    <Textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder={t('admin.support.reply_placeholder')}
                      rows={5}
                      disabled={
                        selectedTicket.status === 'CLOSED' || withModeration
                      }
                    />
                    {selectedTicket.status !== 'CLOSED' && !withModeration && (
                      <Button
                        onClick={handleSaveReply}
                        isLoading={updateMutation.isPending}
                        disabled={!reply.trim()}
                        className="min-h-11"
                      >
                        {t('admin.support.save_reply')}
                      </Button>
                    )}
                    {selectedTicket.reply &&
                      selectedTicket.status === 'CLOSED' && (
                        <p className="text-sm text-white/70 whitespace-pre-wrap leading-relaxed">
                          {selectedTicket.reply}
                        </p>
                      )}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 flex items-start justify-center pt-6 px-2"
              >
                <AdminEmptyState
                  icon={LifeBuoy}
                  title={t('admin.support.detail_empty_title')}
                  description={t('admin.support.detail_empty_description')}
                />
              </motion.div>
            )}
          </AnimatePresence>
        }
      />

      <ConfirmModal
        isOpen={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={() => {
          if (selectedTicket) {
            updateMutation.mutate({
              id: selectedTicket.id,
              status: 'CLOSED',
            });
          }
          setConfirmClose(false);
        }}
        title={t('admin.support.confirm_close_title')}
        message={t('admin.support.confirm_close_message')}
        confirmText={t('admin.shared.confirm')}
        cancelText={t('admin.shared.cancel')}
        isDestructive={false}
      />
      <ConfirmModal
        isOpen={confirmEscalate}
        onClose={() => setConfirmEscalate(false)}
        onConfirm={() => {
          if (selectedTicket) escalateMutation.mutate(selectedTicket.id);
          setConfirmEscalate(false);
        }}
        title={t('admin.support.confirm_escalate_title')}
        message={t('admin.support.confirm_escalate_message')}
        confirmText={t('admin.support.hand_to_moderation')}
        cancelText={t('admin.shared.cancel')}
        isDestructive={false}
      />
    </div>
  );
}
