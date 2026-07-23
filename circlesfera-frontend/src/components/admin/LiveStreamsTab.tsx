import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Radio, Square } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminLiveStream } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import ConfirmModal from '../modals/ConfirmModal';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminList, AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { ActionButton, FilterDropdown, Pagination, Table } from './AdminTable';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export default function LiveStreamsTab({ onToast }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [confirmEndId, setConfirmEndId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse<AdminLiveStream>>({
    queryKey: ['admin', 'live-streams', page, statusFilter],
    queryFn: () =>
      adminApi
        .getLiveStreams(page, 20, statusFilter || undefined)
        .then((r) => r.data),
  });

  const endMutation = useMutation({
    mutationFn: (id: string) => adminApi.endLiveStream(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'live-streams'] });
      onToast(t('admin.live.toast_ended'), 'success');
      setConfirmEndId(null);
    },
    onError: () => onToast(t('admin.live.toast_end_error'), 'error'),
  });

  const statusBadge = (status: AdminLiveStream['status']) =>
    status === 'LIVE' ? (
      <span className="text-red-400 text-xs font-semibold flex items-center gap-1">
        <Radio size={10} className="animate-pulse" />{' '}
        {t('admin.live.status_live')}
      </span>
    ) : (
      <span className="text-gray-500 text-xs font-semibold">
        {t('admin.live.status_ended')}
      </span>
    );

  const streams = data?.data ?? [];

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t('admin.live.title')}
        subtitle={t('admin.live.subtitle')}
      />

      <AdminFilterBar>
        <FilterDropdown
          label={t('admin.live.filter_status')}
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
          options={[
            { value: '', label: t('admin.live.status_all') },
            { value: 'LIVE', label: t('admin.live.status_live') },
            { value: 'ENDED', label: t('admin.live.status_ended') },
          ]}
        />
      </AdminFilterBar>

      <div className="rounded-xl border border-white/10 lg:overflow-clip">
        <AdminList
          loading={isLoading}
          isEmpty={!streams.length}
          emptyTitle={t('admin.live.empty_title')}
          emptyDescription={t('admin.live.empty_description')}
          mobile={
            <div className="space-y-2">
              {streams.map((stream) => (
                <AdminListRow
                  key={stream.id}
                  title={
                    stream.title ||
                    t('admin.live.untitled', {
                      user: stream.host?.profile?.username || '—',
                    })
                  }
                  subtitle={`@${stream.host?.profile?.username || t('admin.shared.unknown')}`}
                  badge={statusBadge(stream.status)}
                  meta={t('admin.live.viewers_count', {
                    count: stream.viewerCount,
                  })}
                  primaryAction={
                    stream.status === 'LIVE' ? (
                      <ActionButton
                        onClick={() => setConfirmEndId(stream.id)}
                        label={t('admin.live.action_end')}
                        variant="danger"
                        icon={Square}
                        disabled={endMutation.isPending}
                      />
                    ) : undefined
                  }
                />
              ))}
            </div>
          }
          desktop={
            <Table
              headers={[
                t('admin.live.col_title'),
                t('admin.live.col_host'),
                t('admin.live.col_status'),
                t('admin.live.col_viewers'),
                t('admin.live.col_started'),
                t('admin.live.col_actions'),
              ]}
              columnWidths={[
                'min-w-[8rem]',
                'min-w-[6rem]',
                'w-[5.5rem]',
                'w-[4.5rem]',
                'hidden lg:table-cell w-[6rem]',
                'w-[4rem]',
              ]}
              loading={false}
              isEmpty={false}
            >
              {streams.map((stream) => (
                <tr
                  key={stream.id}
                  className="hover:bg-white/[0.07] transition-colors border-b border-white/5 last:border-0"
                >
                  <td className="px-2 py-1">
                    <span className="text-white text-sm font-medium truncate block max-w-[12rem]">
                      {stream.title ||
                        t('admin.live.untitled', {
                          user: stream.host?.profile?.username || '—',
                        })}
                    </span>
                  </td>
                  <td className="px-2 py-1">
                    <span className="text-brand-primary text-sm font-semibold truncate block max-w-[6rem]">
                      @
                      {stream.host?.profile?.username ||
                        t('admin.shared.unknown')}
                    </span>
                  </td>
                  <td className="px-2 py-1">{statusBadge(stream.status)}</td>
                  <td className="px-2 py-1 text-gray-300 text-sm tabular-nums">
                    {stream.viewerCount}
                  </td>
                  <td className="px-2 py-1 text-gray-500 text-sm whitespace-nowrap hidden lg:table-cell">
                    {new Date(stream.startedAt).toLocaleString()}
                  </td>
                  <td className="px-2 py-1">
                    {stream.status === 'LIVE' && (
                      <ActionButton
                        onClick={() => setConfirmEndId(stream.id)}
                        label={t('admin.live.action_end')}
                        variant="danger"
                        icon={Square}
                        iconOnly
                        disabled={endMutation.isPending}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          }
        />
        <Pagination meta={data?.meta} onPageChange={setPage} />
      </div>

      <ConfirmModal
        isOpen={confirmEndId !== null}
        onClose={() => setConfirmEndId(null)}
        onConfirm={() => {
          if (confirmEndId) endMutation.mutate(confirmEndId);
        }}
        title={t('admin.live.confirm_end_title')}
        message={t('admin.live.confirm_end_message')}
        confirmText={t('admin.live.confirm_end')}
        cancelText={t('admin.shared.cancel')}
        isDestructive
        isLoading={endMutation.isPending}
      />
    </div>
  );
}
