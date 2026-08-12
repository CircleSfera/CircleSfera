import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Radio, StopCircle, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminLiveStream } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import ConfirmModal from '../modals/ConfirmModal';
import { Button } from '../ui';
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
          selectedStream ? (
            <div className="p-3 sm:p-4">
              <div className="aspect-video bg-black rounded-xl border border-white/10 mb-6 flex items-center justify-center relative overflow-hidden group">
                {selectedStream.status === 'LIVE' ? (
                  <>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Radio className="w-16 h-16 text-white/20 animate-pulse" />
                    </div>
                    <div className="absolute top-4 left-4 flex items-center space-x-2">
                      <span className="px-3 py-1 bg-red-500 text-white text-sm font-bold rounded-full animate-pulse">
                        LIVE
                      </span>
                      <span className="px-3 py-1 bg-black/50 backdrop-blur text-white text-sm font-medium rounded-full flex items-center">
                        <Users size={14} className="mr-2" />
                        {selectedStream.viewerCount || 0}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="text-white/40 flex flex-col items-center">
                    <StopCircle size={40} className="mb-2 opacity-50" />
                    <span className="text-sm font-medium">
                      {t('admin.lives.status_ended', 'Transmisión finalizada')}
                    </span>
                  </div>
                )}
              </div>

              <h2 className="text-xl font-bold text-white mb-1">
                {selectedStream.title ||
                  t('admin.shared.unknown', 'Desconocido')}
              </h2>
              <div className="flex items-center space-x-3 mb-4 pb-4 border-b border-white/5">
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white font-bold text-sm shrink-0">
                  {selectedStream.host?.profile?.username
                    ?.charAt(0)
                    .toUpperCase() || '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white truncate text-sm">
                    @
                    {selectedStream.host?.profile?.username ||
                      t('admin.shared.unknown', 'Desconocido')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3">
                <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                  <p className="text-xs text-white/50 mb-0.5">
                    {t('admin.lives.started_at', 'Iniciado')}
                  </p>
                  <p className="text-white text-sm font-medium">
                    {selectedStream.startedAt
                      ? new Date(selectedStream.startedAt).toLocaleString()
                      : t('admin.shared.unknown', 'Desconocido')}
                  </p>
                </div>
                {selectedStream.endedAt && (
                  <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                    <p className="text-xs text-white/50 mb-0.5">
                      {t('admin.lives.ended_at', 'Finalizado')}
                    </p>
                    <p className="text-white text-sm font-medium">
                      {new Date(selectedStream.endedAt).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>

              {selectedStream.status === 'LIVE' && (
                <Button
                  onClick={() => setConfirmEndId(selectedStream.id)}
                  variant="danger"
                  className="w-full h-11"
                  disabled={endStreamMutation.isPending}
                >
                  <StopCircle size={18} className="mr-2" />
                  {t('admin.lives.action_end', 'Finalizar')}
                </Button>
              )}
            </div>
          ) : (
            <AdminEmptyState
              icon={Eye}
              title={t('admin.shared.select_item_title')}
              description={t('admin.shared.select_item_description')}
            />
          )
        }
      />

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
