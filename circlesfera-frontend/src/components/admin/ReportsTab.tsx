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
import { FilterDropdown, Pagination, SearchInput } from './AdminTable';

function timeAgo(date: string | Date): string {
  const now = Date.now();
  const d = new Date(date).getTime();
  const diff = Math.max(0, now - d);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `hace ${days}d`;
  return new Date(date).toLocaleDateString();
}

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export default function ReportsTab({ onToast }: Props) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('PENDING'); // Default to pending for moderation flow
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
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
      onToast('Reporte actualizado', 'success');
    },
    onError: () => onToast('Error al actualizar reporte', 'error'),
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
        IGNORE: 'Falso positivo descartado',
        STRIKE: 'Strike aplicado al usuario',
        BAN: 'Usuario baneado permanentemente',
      };
      onToast(msgs[variables.action], 'success');
    },
    onError: () => onToast('Error al aplicar penalización', 'error'),
  });

  const selectedReport = data?.data.find((r) => r.id === selectedReportId);

  const isFiltered =
    debouncedSearch.length > 0 ||
    (statusFilter !== '' && statusFilter !== 'PENDING');

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('PENDING');
    setPage(1);
    setSelectedReportId(null);
  };

  return (
    <div className="flex flex-col min-h-0 gap-4">
      <AdminPageHeader
        title="Reportes de Usuario"
        subtitle="Cola de moderación de reportes pendientes"
      />

      <AdminFilterBar>
        <div className="flex-1 min-w-0">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Buscar reportes..."
          />
        </div>
        <FilterDropdown
          label="Estado"
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            setPage(1);
            setSelectedReportId(null);
          }}
          options={[
            { value: '', label: 'Todos' },
            { value: 'PENDING', label: 'Pendientes' },
            { value: 'RESOLVED', label: 'Resueltos' },
            { value: 'REJECTED', label: 'Descartados' },
          ]}
        />
      </AdminFilterBar>

      <AdminSplitView
        hasSelection={!!selectedReportId}
        onBack={() => setSelectedReportId(null)}
        listTitle="Cola de Moderación"
        list={
          <div className="flex flex-col h-full min-h-0">
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {isLoading ? (
                <AdminListSkeleton rows={5} />
              ) : !data || data.data.length === 0 ? (
                <AdminEmptyState
                  icon={Check}
                  title={
                    isFiltered
                      ? 'Sin reportes con estos filtros'
                      : 'No hay reportes en la cola'
                  }
                  description={
                    isFiltered
                      ? 'Prueba otro término o cambia el estado del filtro.'
                      : 'La cola de reportes pendientes está vacía.'
                  }
                  action={
                    isFiltered ? (
                      <Button
                        onClick={clearFilters}
                        variant="secondary"
                        className="min-h-11"
                      >
                        Limpiar filtros
                      </Button>
                    ) : undefined
                  }
                  compact
                />
              ) : (
                data.data.map((report) => (
                  <AdminListRow
                    key={report.id}
                    onClick={() => setSelectedReportId(report.id)}
                    className={
                      selectedReportId === report.id
                        ? 'border-brand-primary/30 bg-brand-primary/10'
                        : undefined
                    }
                    title={`@${report.targetContent?.author || 'Desconocido'}`}
                    subtitle={report.targetType}
                    badge={
                      <span className="text-xs font-semibold uppercase tracking-wide text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">
                        {report.reason}
                      </span>
                    }
                    meta={timeAgo(report.createdAt)}
                    avatar={
                      <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-white/10 overflow-hidden shrink-0">
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
                    }
                  />
                ))
              )}
            </div>

            <div className="p-2 border-t border-white/5 shrink-0">
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
                <div className="p-4 border-b border-white/5 bg-white/2 flex flex-col gap-3 shrink-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2 flex-wrap">
                        Detalles del Reporte
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
                          Ver Original
                        </button>
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
                            <span className="truncate">Ignorar</span>
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
                            <span className="truncate">Strike</span>
                          </Button>
                          <Button
                            onClick={() =>
                              setConfirmModal({
                                isOpen: true,
                                title: '¿Banear usuario?',
                                message:
                                  '¿Seguro que quieres BANEAR a este usuario? Esta acción le impedirá volver a iniciar sesión.',
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
                            <span className="truncate">Banear</span>
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
                            <span className="truncate">Ignorar</span>
                          </Button>
                          <Button
                            onClick={() =>
                              setConfirmModal({
                                isOpen: true,
                                title: '¿Eliminar contenido?',
                                message:
                                  '¿Seguro que quieres eliminar este contenido permanentemente?',
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
                                      onToast('Contenido eliminado', 'success');
                                    })
                                    .catch(() =>
                                      onToast('Error al eliminar', 'error'),
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
                            <span className="truncate">Eliminar</span>
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Content Viewer */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 flex flex-col lg:flex-row gap-4">
                  {/* Visual Preview */}
                  <div className="w-full lg:w-1/2 flex flex-col gap-4">
                    <div className="bg-black/50 rounded-lg border border-white/10 flex-1 min-h-[240px] sm:min-h-[300px] flex items-center justify-center overflow-hidden relative">
                      {selectedReport.targetContent?.thumbnail ? (
                        <img
                          src={selectedReport.targetContent.thumbnail}
                          className="w-full h-full object-contain"
                          alt="Reported content"
                        />
                      ) : (
                        <div className="text-gray-600 flex flex-col items-center">
                          <Ghost size={48} className="mb-4" />
                          <p className="text-sm font-semibold">
                            Sin vista previa visual
                          </p>
                        </div>
                      )}
                    </div>
                    {selectedReport.targetContent?.text && (
                      <div className="p-4 bg-white/5 rounded-xl border border-white/10 text-sm text-gray-300 italic">
                        "{selectedReport.targetContent.text}"
                      </div>
                    )}
                  </div>

                  {/* Metadata */}
                  <div className="w-full lg:w-1/2 space-y-4">
                    <div className="p-4 bg-white/2 rounded-xl border border-white/5">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                        Motivo del Reporte
                      </p>
                      <p className="text-red-400 font-semibold text-base sm:text-lg mb-4">
                        {selectedReport.reason}
                      </p>

                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                        Reportado por
                      </p>
                      {selectedReport.details?.includes(
                        '[AI Automated Flag]',
                      ) ? (
                        <div className="flex items-center gap-2 text-brand-primary font-semibold text-sm">
                          <Bot size={16} /> Sistema IA (Auto-Moderación)
                        </div>
                      ) : (
                        <p className="text-white font-semibold text-sm">
                          @
                          {selectedReport.reporter?.profile?.username ||
                            'Anónimo'}
                        </p>
                      )}
                    </div>

                    {selectedReport.details && (
                      <div className="p-4 bg-white/2 rounded-xl border border-white/5">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          Detalles Adicionales
                        </p>
                        <div className="text-sm text-gray-300 whitespace-pre-wrap">
                          {selectedReport.details.replace(
                            '[AI Automated Flag]: ',
                            '',
                          )}
                        </div>
                      </div>
                    )}

                    <div className="p-4 bg-white/2 rounded-xl border border-white/5">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Estado Actual
                      </p>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold uppercase ${
                          selectedReport.status === 'PENDING'
                            ? 'bg-yellow-500/20 text-yellow-500'
                            : selectedReport.status === 'RESOLVED'
                              ? 'bg-green-500/20 text-green-500'
                              : 'bg-zinc-500/20 text-zinc-400'
                        }`}
                      >
                        {selectedReport.status}
                      </span>
                    </div>
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
                  title="Selecciona un reporte de la cola"
                  description="Todo limpio por aquí"
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
        confirmText="Confirmar"
        cancelText="Cancelar"
        isDestructive={true}
      />
    </div>
  );
}
