import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
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
import { LoadingSpinner } from '../index';
import { Button } from '../ui';
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

  // Keyboard shortcuts could be added here in a useEffect listening to 'A', 'D', 'X'

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] gap-4">
      <div className="flex flex-col sm:flex-row gap-3 shrink-0">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Buscar reportes..."
        />
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
      </div>

      <div className="flex flex-1 min-h-0 gap-4">
        {/* Left Pane: Queue */}
        <div
          className={`w-full lg:w-1/3 flex-col glass-panel rounded-lg border border-white/5 overflow-hidden shadow-lg ${selectedReportId ? 'hidden lg:flex' : 'flex'}`}
        >
          <div className="p-4 border-b border-white/5 shrink-0 bg-white/2">
            <h3 className="font-bold text-white flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-400" />
              Cola de Moderación
              <span className="bg-white/10 text-xs px-2 py-0.5 rounded-full text-gray-300 ml-auto">
                {data?.meta.total || 0}
              </span>
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
            {isLoading ? (
              <div className="flex justify-center p-8">
                <LoadingSpinner />
              </div>
            ) : !data || data.data.length === 0 ? (
              <div className="text-center p-8 text-gray-500 text-sm">
                No hay reportes en la cola
              </div>
            ) : (
              data.data.map((report) => (
                <button
                  type="button"
                  key={report.id}
                  onClick={() => setSelectedReportId(report.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    selectedReportId === report.id
                      ? 'bg-brand-primary/10 border-brand-primary/30'
                      : 'bg-white/2 border-transparent hover:bg-white/5 hover:border-white/10'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-black uppercase tracking-wide text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">
                      {report.reason}
                    </span>
                    <span className="text-xs text-gray-500">
                      {timeAgo(report.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
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
                    <div className="min-w-0">
                      <p className="text-white text-xs font-bold truncate">
                        @{report.targetContent?.author || 'Desconocido'}
                      </p>
                      <p className="text-zinc-400 text-xs truncate">
                        {report.targetType}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="p-2 border-t border-white/5 shrink-0 bg-white/2">
            <Pagination meta={data?.meta} onPageChange={setPage} />
          </div>
        </div>

        {/* Right Pane: Details & Resolution */}
        <div
          className={`flex-1 glass-panel rounded-lg border border-white/5 overflow-hidden shadow-lg flex-col relative ${selectedReportId ? 'flex' : 'hidden lg:flex'}`}
        >
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
                <div className="p-4 border-b border-white/5 bg-white/2 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => setSelectedReportId(null)}
                      className="lg:hidden p-2 -ml-2 text-gray-300 hover:text-white"
                    >
                      <ArrowLeft size={20} />
                    </button>
                    <div>
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
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
                          className="text-xs font-bold bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 px-2 py-1 rounded transition-colors"
                        >
                          Ver Original
                        </button>
                      </h3>
                      <p className="text-xs text-gray-300">
                        ID: {selectedReport.id}
                      </p>
                    </div>
                  </div>
                  {selectedReport.status === 'PENDING' && (
                    <div className="flex items-center gap-2">
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
                            className="text-sm font-bold border-white/5 px-4 py-2"
                          >
                            <X size={16} className="mr-2" /> Falso Positivo
                            (Ignorar)
                          </Button>
                          <Button
                            onClick={() =>
                              penaltyMutation.mutate({
                                id: selectedReport.id,
                                action: 'STRIKE',
                              })
                            }
                            isLoading={penaltyMutation.isPending}
                            className="bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30 border border-yellow-500/50 text-sm font-bold px-4 py-2"
                          >
                            <Gavel size={16} className="mr-2" /> Confirmar
                            Strike
                          </Button>
                          <Button
                            onClick={() => {
                              if (
                                window.confirm(
                                  '¿Seguro que quieres BANEAR a este usuario? Esta acción le impedirá volver a iniciar sesión.',
                                )
                              ) {
                                penaltyMutation.mutate({
                                  id: selectedReport.id,
                                  action: 'BAN',
                                });
                              }
                            }}
                            isLoading={penaltyMutation.isPending}
                            variant="danger"
                            className="text-sm font-bold border-red-500/30 px-4 py-2"
                          >
                            <AlertOctagon size={16} className="mr-2" /> Banear
                            Usuario
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
                            className="text-sm font-bold border-white/5 px-4 py-2"
                          >
                            <X size={16} className="mr-2" /> Ignorar (D)
                          </Button>
                          <Button
                            onClick={() => {
                              if (
                                window.confirm(
                                  '¿Seguro que quieres eliminar este contenido permanentemente?',
                                )
                              ) {
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
                              }
                            }}
                            isLoading={updateMutation.isPending}
                            variant="danger"
                            className="text-sm font-bold border-red-500/30 px-4 py-2"
                          >
                            <Trash2 size={16} className="mr-2" /> Eliminar
                            Contenido (E)
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Content Viewer */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex gap-4">
                  {/* Visual Preview */}
                  <div className="w-1/2 flex flex-col gap-4">
                    <div className="bg-black/50 rounded-lg border border-white/10 flex-1 min-h-[300px] flex items-center justify-center overflow-hidden relative">
                      {selectedReport.targetContent?.thumbnail ? (
                        <img
                          src={selectedReport.targetContent.thumbnail}
                          className="w-full h-full object-contain"
                          alt="Reported content"
                        />
                      ) : (
                        <div className="text-gray-600 flex flex-col items-center">
                          <Ghost size={48} className="mb-4" />
                          <p className="text-sm font-bold">
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
                  <div className="w-1/2 space-y-4">
                    <div className="p-4 bg-white/2 rounded-xl border border-white/5">
                      <p className="text-xs font-black text-gray-500 uppercase tracking-wide mb-1">
                        Motivo del Reporte
                      </p>
                      <p className="text-red-400 font-bold text-lg mb-4">
                        {selectedReport.reason}
                      </p>

                      <p className="text-xs font-black text-gray-500 uppercase tracking-wide mb-1">
                        Reportado por
                      </p>
                      {selectedReport.details?.includes(
                        '[AI Automated Flag]',
                      ) ? (
                        <div className="flex items-center gap-2 text-brand-primary font-bold">
                          <Bot size={16} /> Sistema IA (Auto-Moderación)
                        </div>
                      ) : (
                        <p className="text-white font-bold">
                          @
                          {selectedReport.reporter?.profile?.username ||
                            'Anónimo'}
                        </p>
                      )}
                    </div>

                    {selectedReport.details && (
                      <div className="p-4 bg-white/2 rounded-xl border border-white/5">
                        <p className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
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
                      <p className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2">
                        Estado Actual
                      </p>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-black uppercase ${
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
                className="flex-1 flex flex-col items-center justify-center text-gray-500"
              >
                <Check size={48} className="mb-4 text-white/10" />
                <p className="font-bold">Selecciona un reporte de la cola</p>
                <p className="text-sm">Todo limpio por aquí</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
