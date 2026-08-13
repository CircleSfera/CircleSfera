import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Radio, StopCircle, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminLiveStream } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import ConfirmModal from '../modals/ConfirmModal';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminKpiWidget } from './AdminKpiWidget';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminSegmentedControl } from './AdminSegmentedControl';
import { AdminListSkeleton } from './AdminSkeletons';
import { AdminSplitView } from './AdminSplitView';
import { ActionButton, Pagination } from './AdminTable';
import {
  AdminUserFilterChip,
  useAdminQueueUserFilter,
} from './AdminUserFilterChip';
import LiveStreamDetailPanel from './LiveStreamDetailPanel';

export default function LiveStreamsTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { userId, username, clearUserFilter } = useAdminQueueUserFilter();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState(() =>
    userId ? '' : 'LIVE',
  );
  const [confirmEndId, setConfirmEndId] = useState<string | null>(null);
  const [selectedStream, setSelectedStream] = useState<AdminLiveStream | null>(
    null,
  );

  useEffect(() => {
    setStatusFilter(userId ? '' : 'LIVE');
    setPage(1);
    setSelectedStream(null);
  }, [userId]);

  const { data, isLoading } = useQuery<PaginatedResponse<AdminLiveStream>>({
    queryKey: ['admin', 'livestreams', page, statusFilter, userId],
    queryFn: () =>
      adminApi
        .getLiveStreams(page, 10, statusFilter || undefined, userId)
        .then((res) => res.data as PaginatedResponse<AdminLiveStream>),
  });

  const streams = data?.data ?? [];
  const activeStreams = streams.filter((s) => s.status === 'LIVE');
  const totalViewers = activeStreams.reduce(
    (acc, s) => acc + (s.viewerCount || 0),
    0,
  );

  const endStreamMutation = useMutation({
    mutationFn: (id: string) => adminApi.endLiveStream(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'livestreams'] });
      setConfirmEndId(null);
    },
  });

  return (
    <div className="space-y-2.5">
      <AdminPageHeader
        title={t('admin.lives.title', 'Directos')}
        subtitle={t(
          'admin.lives.subtitle',
          'Gestión y monitorización de transmisiones en vivo',
        )}
      />

      {/* Summary Widgets */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <AdminKpiWidget
          title={t('admin.lives.kpi_active')}
          value={activeStreams.length}
          icon={<Radio size={16} />}
          iconColorClass="text-red-500 bg-red-500/10"
        />
        <AdminKpiWidget
          title={t('admin.lives.kpi_viewers')}
          value={totalViewers.toLocaleString()}
          icon={<Users size={16} />}
          iconColorClass="text-brand-primary bg-brand-primary/10"
        />
        <AdminKpiWidget
          title={t('admin.lives.kpi_traffic')}
          value={t('admin.lives.kpi_traffic_normal')}
          icon={<Eye size={16} />}
          iconColorClass="text-green-400 bg-green-400/10"
        />
      </div>

      <AdminFilterBar>
        <AdminSegmentedControl
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
          options={[
            { value: 'LIVE', label: t('admin.lives.status_live') },
            { value: 'ENDED', label: t('admin.lives.status_ended') },
            { value: '', label: t('admin.lives.status_all') },
          ]}
        />
        {userId && (
          <AdminUserFilterChip username={username} onClear={clearUserFilter} />
        )}
      </AdminFilterBar>

      <AdminSplitView
        hasSelection={!!selectedStream}
        onBack={() => setSelectedStream(null)}
        onClearSelection={() => setSelectedStream(null)}
        listTitle={t('admin.lives.title', 'Directos')}
        list={
          <div className="flex flex-col h-full min-h-0">
            <div className="flex-1 overflow-y-auto space-y-2 pb-2">
              {isLoading ? (
                <AdminListSkeleton rows={4} />
              ) : streams.length === 0 ? (
                <AdminEmptyState
                  icon={Radio}
                  title={t('admin.lives.empty_title', 'No hay directos')}
                  description={t(
                    'admin.lives.empty_description',
                    'No se encontraron directos con los filtros actuales.',
                  )}
                  compact
                />
              ) : (
                streams.map((stream) => (
                  <AdminListRow
                    key={stream.id}
                    onClick={() => setSelectedStream(stream)}
                    className={
                      selectedStream?.id === stream.id
                        ? 'border-brand-primary/30 bg-brand-primary/10'
                        : undefined
                    }
                    title={stream.title || t('admin.shared.unknown')}
                    subtitle={`@${stream.host?.profile?.username || t('admin.shared.unknown')}`}
                    avatar={
                      <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center text-white/50 overflow-hidden">
                        <Radio size={20} />
                      </div>
                    }
                    badge={
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider ${
                          stream.status === 'LIVE'
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : 'bg-white/5 text-white/50 border border-white/5'
                        }`}
                      >
                        {stream.status}
                      </span>
                    }
                    meta={
                      stream.status === 'LIVE' && (
                        <div className="flex items-center text-red-400">
                          <Users size={14} className="mr-1" />
                          {stream.viewerCount || 0}
                        </div>
                      )
                    }
                    primaryAction={
                      stream.status === 'LIVE' ? (
                        <ActionButton
                          onClick={() => setConfirmEndId(stream.id)}
                          label={t('admin.lives.action_end', 'Finalizar')}
                          variant="danger"
                          icon={StopCircle}
                          disabled={endStreamMutation.isPending}
                        />
                      ) : undefined
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
          <AdminEmptyState
            icon={Eye}
            title={t('admin.shared.select_item_title')}
            description={t('admin.shared.select_item_description')}
          />
        }
      />

      {selectedStream && (
        <LiveStreamDetailPanel
          stream={selectedStream}
          onClose={() => setSelectedStream(null)}
          onEndStream={(id) => setConfirmEndId(id)}
        />
      )}

      <ConfirmModal
        isOpen={confirmEndId !== null}
        onClose={() => setConfirmEndId(null)}
        onConfirm={() => confirmEndId && endStreamMutation.mutate(confirmEndId)}
        title={t('admin.lives.confirm_end_title', 'Finalizar directo')}
        message={t(
          'admin.lives.confirm_end_message',
          '¿Estás seguro de que deseas finalizar esta transmisión? Los espectadores serán desconectados inmediatamente.',
        )}
        confirmText={t('admin.lives.action_end', 'Finalizar')}
        cancelText={t('admin.shared.cancel', 'Cancelar')}
        isDestructive={true}
        isLoading={endStreamMutation.isPending}
      />
    </div>
  );
}
