import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Bot, ExternalLink, Ghost } from 'lucide-react';
import { useState } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import type { AdminReport } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import {
  ActionButton,
  FilterDropdown,
  Pagination,
  SearchInput,
  StatusBadge,
  Table,
} from './AdminTable';

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
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search);
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      onToast('Reporte actualizado', 'success');
    },
    onError: () => onToast('Error al actualizar reporte', 'error'),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Buscar reportes..."
        />
        <FilterDropdown
          label="Filtrar por estado"
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
          options={[
            { value: '', label: 'Todos los estados' },
            { value: 'pending', label: 'Pendientes' },
            { value: 'resolved', label: 'Resueltos' },
            { value: 'dismissed', label: 'Descartados' },
          ]}
        />
      </div>

      <div className="glass-panel rounded-2xl overflow-clip border border-white/10">
        <Table
          headers={[
            'Fecha',
            'Contenido',
            'Reportero',
            'Tipo',
            'Motivo',
            'Estado',
            'Acciones',
          ]}
          loading={isLoading}
          isEmpty={!data || data.data.length === 0}
        >
          {data?.data.map((report) => (
            <>
              {/* Desktop row */}
              <motion.tr
                key={report.id}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="hover:bg-white/[0.07] transition-colors border-b border-white/5 last:border-0"
              >
                <td className="px-4 py-3 whitespace-nowrap text-gray-400 text-sm">
                  <span title={new Date(report.createdAt).toLocaleString()}>
                    {timeAgo(report.createdAt)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="flex items-center gap-3 cursor-pointer group/preview text-left"
                    onClick={() =>
                      setExpandedId(expandedId === report.id ? null : report.id)
                    }
                  >
                    <div className="w-12 h-12 rounded-lg bg-zinc-900 border border-white/10 overflow-hidden shrink-0">
                      {report.targetContent?.thumbnail ? (
                        <img
                          src={report.targetContent.thumbnail}
                          className="w-full h-full object-cover"
                          alt="Thumbnail"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-700">
                          <Ghost size={20} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 max-w-[150px]">
                      <p className="text-white text-xs font-bold truncate">
                        @{report.targetContent?.author || 'Desconocido'}
                      </p>
                      <p className="text-zinc-500 text-[10px] truncate">
                        {report.targetContent?.text || 'Sin texto'}
                      </p>
                    </div>
                  </button>
                </td>
                <td className="px-4 py-3">
                  {report.details?.includes('[AI Automated Flag]') ? (
                    <div className="flex items-center gap-2">
                      <div className="bg-red-500/10 text-red-400 p-1.5 rounded-full border border-red-500/20">
                        <Bot size={14} />
                      </div>
                      <span className="text-red-400 font-bold text-xs tracking-wide">
                        AI System
                      </span>
                    </div>
                  ) : (
                    <span className="text-zinc-400 text-sm">
                      @{report.reporter?.profile?.username || 'Anónimo'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 bg-white/5 rounded text-[10px] font-black uppercase tracking-wider text-gray-500 border border-white/10">
                    {report.targetType}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-red-400 text-[10px] font-black uppercase tracking-widest border border-red-400/20 px-2 py-0.5 rounded bg-red-400/5">
                    {report.reason}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={report.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5 items-center">
                    {report.status.toLowerCase() === 'pending' && (
                      <>
                        <ActionButton
                          onClick={() =>
                            updateMutation.mutate({
                              id: report.id,
                              status: 'RESOLVED',
                            })
                          }
                          label="Resolver"
                          variant="success"
                          iconOnly
                          disabled={updateMutation.isPending}
                        />
                        <ActionButton
                          onClick={() =>
                            updateMutation.mutate({
                              id: report.id,
                              status: 'DISMISSED',
                            })
                          }
                          label="Descartar"
                          variant="ghost"
                          iconOnly
                          disabled={updateMutation.isPending}
                        />
                        <ActionButton
                          onClick={() => {
                            if (
                              window.confirm(
                                '¿Seguro que quieres eliminar este contenido?',
                              )
                            ) {
                              const deleteFn =
                                report.targetType.toUpperCase() === 'POST'
                                  ? adminApi.deletePost
                                  : report.targetType.toUpperCase() === 'STORY'
                                    ? adminApi.deleteStory
                                    : adminApi.deleteComment;

                              deleteFn(report.targetId)
                                .then(() => {
                                  updateMutation.mutate({
                                    id: report.id,
                                    status: 'RESOLVED',
                                  });
                                  onToast('Contenido eliminado', 'success');
                                })
                                .catch(() =>
                                  onToast(
                                    'Error al eliminar contenido',
                                    'error',
                                  ),
                                );
                            }
                          }}
                          label="Eliminar Contenido"
                          variant="danger"
                          iconOnly
                          disabled={updateMutation.isPending}
                        />
                      </>
                    )}
                    <a
                      href={
                        report.targetType.toLowerCase() === 'post'
                          ? `/post/${report.targetId}`
                          : report.targetType.toLowerCase() === 'story'
                            ? `/story/${report.targetId}`
                            : '#'
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Ver en plataforma"
                      className="p-2 rounded-lg text-brand-primary bg-brand-primary/10 hover:bg-brand-primary hover:text-white transition-all"
                      aria-label="Ver contenido reportado"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </td>
              </motion.tr>

              {/* Expanded details row */}
              {expandedId === report.id && report.details && (
                <tr
                  key={`${report.id}-details`}
                  className="border-b border-white/5"
                >
                  <td colSpan={7} className="px-6 py-4 bg-white/2">
                    <div className="text-gray-400 text-sm whitespace-pre-wrap">
                      {report.details.includes('[AI Automated Flag]') ? (
                        <>
                          <div className="flex items-center gap-2 mb-2 text-red-400 font-medium">
                            <Bot size={16} />
                            <span>Reporte automatizado por IA</span>
                          </div>
                          <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-lg text-red-200">
                            {report.details.replace(
                              '[AI Automated Flag]: ',
                              '',
                            )}
                          </div>
                        </>
                      ) : (
                        report.details
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </Table>
        <Pagination meta={data?.meta} onPageChange={setPage} />
      </div>
    </div>
  );
}
