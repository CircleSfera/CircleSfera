import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, LifeBuoy, Mail, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminSupportTicket } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import ConfirmModal from '../modals/ConfirmModal';
import { Button, Textarea } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminListSkeleton } from './AdminSkeletons';
import { AdminSplitView } from './AdminSplitView';
import { FilterDropdown, Pagination } from './AdminTable';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

type TicketStatus = 'OPEN' | 'RESOLVED' | 'CLOSED';

function statusBadgeClass(status: TicketStatus) {
  switch (status) {
    case 'OPEN':
      return 'bg-yellow-500/20 text-yellow-500';
    case 'RESOLVED':
      return 'bg-green-500/20 text-green-500';
    case 'CLOSED':
      return 'bg-zinc-500/20 text-zinc-400';
  }
}

export default function SupportTicketsTab({ onToast }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);

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
                        {ticket.status}
                      </span>
                    }
                    meta={new Date(ticket.createdAt).toLocaleDateString()}
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
                    <p className="text-xs text-gray-400 truncate">
                      ID: {selectedTicket.id}
                    </p>
                  </div>
                  {selectedTicket.status !== 'CLOSED' && (
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
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5 space-y-5">
                  <dl className="text-sm">
                    <div className="py-2.5 border-b border-white/5">
                      <dt className="text-xs font-medium text-gray-500 mb-1">
                        {t('admin.support.email_label')}
                      </dt>
                      <dd className="text-white font-semibold flex items-center gap-2">
                        <Mail size={14} className="text-gray-500 shrink-0" />
                        {selectedTicket.email}
                      </dd>
                      {selectedTicket.user?.profile?.username && (
                        <dd className="text-xs text-gray-400 mt-1">
                          @{selectedTicket.user.profile.username}
                        </dd>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-white/5">
                      <dt className="text-xs font-medium text-gray-500">
                        {t('admin.support.status_label')}
                      </dt>
                      <dd>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wide ${statusBadgeClass(selectedTicket.status)}`}
                        >
                          {selectedTicket.status}
                        </span>
                      </dd>
                    </div>
                  </dl>
                  <p className="text-xs text-gray-500">
                    {t('admin.support.created_at', {
                      date: new Date(selectedTicket.createdAt).toLocaleString(),
                    })}
                  </p>

                  <div>
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      {t('admin.support.message_label')}
                    </p>
                    <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                      {selectedTicket.message}
                    </p>
                  </div>

                  <div className="space-y-3 pt-1 border-t border-white/5">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      {t('admin.support.reply_label')}
                    </p>
                    <Textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder={t('admin.support.reply_placeholder')}
                      rows={5}
                      disabled={selectedTicket.status === 'CLOSED'}
                    />
                    {selectedTicket.status !== 'CLOSED' && (
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
                        <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
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
                className="flex-1 flex items-center justify-center p-6"
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
    </div>
  );
}
