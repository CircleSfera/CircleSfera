import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, Eye, ShieldAlert, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import type { AdminPost } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import ConfirmModal from '../modals/ConfirmModal';
import {
  ActionButton,
  FilterDropdown,
  Pagination,
  SearchInput,
  Table,
} from './AdminTable';
import PostPreviewModal from './PostPreviewModal';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export default function ModerationTab({ onToast }: Props) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const debouncedSearch = useDebounce(search);
  const queryClient = useQueryClient();

  const [previewPost, setPreviewPost] = useState<AdminPost | null>(null);
  const [actionItem, setActionItem] = useState<{
    id: string;
    type: any;
    status: any;
  } | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse<AdminPost>>({
    queryKey: ['admin', 'moderation', page, typeFilter, debouncedSearch],
    queryFn: () =>
      adminApi
        .getModerationQueue(
          page,
          10,
          typeFilter || undefined,
          debouncedSearch || undefined,
        )
        .then((res) => res.data as PaginatedResponse<AdminPost>),
  });

  const moderationMutation = useMutation({
    mutationFn: ({
      id,
      type,
      status,
      note,
    }: {
      id: string;
      type: any;
      status: any;
      note?: string;
    }) => adminApi.updateModerationStatus(type, id, status, note),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'moderation'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'posts'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      setActionItem(null);

      const actionName =
        variables.status === 'VISIBLE'
          ? 'aprobado'
          : variables.status === 'HIDDEN'
            ? 'ocultado'
            : 'eliminado';
      onToast(`Contenido ${actionName} correctamente`, 'success');
    },
    onError: () => onToast('Error al procesar moderación', 'error'),
  });

  const batchModerationMutation = useMutation({
    mutationFn: async ({ status, note }: { status: any; note?: string }) => {
      const promises = Array.from(selectedIds).map((id) => {
        const item = data?.data.find((i) => i.id === id);
        if (!item) return Promise.resolve();
        return adminApi.updateModerationStatus(
          item.type as any,
          id,
          status,
          note,
        );
      });
      return Promise.all(promises);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'moderation'] });
      setSelectedIds(new Set());
      const actionName =
        variables.status === 'VISIBLE' ? 'aprobados' : 'ocultados';
      onToast(
        `${selectedIds.size} elementos ${actionName} correctamente`,
        'success',
      );
    },
    onError: () => onToast('Error al procesar lote', 'error'),
  });

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === data?.data.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data?.data.map((i) => i.id)));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <ShieldAlert size={20} className="text-amber-500" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white">
              Cola de Moderación AI
            </h2>
            <p className="text-xs text-gray-500">
              Contenido marcado automáticamente por el sistema
            </p>
          </div>
        </div>

        <AnimatePresence>
          {selectedIds.size > 0 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex items-center gap-2 p-1.5 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md"
            >
              <span className="px-3 text-xs font-bold text-white/60">
                {selectedIds.size} seleccionados
              </span>
              <ActionButton
                onClick={() =>
                  batchModerationMutation.mutate({
                    status: 'VISIBLE',
                    note: 'Batch Approved',
                  })
                }
                label="Aprobar todos"
                variant="success"
                icon={CheckCircle}
                disabled={batchModerationMutation.isPending}
              />
              <ActionButton
                onClick={() =>
                  batchModerationMutation.mutate({
                    status: 'HIDDEN',
                    note: 'Batch Hidden',
                  })
                }
                label="Ocultar todos"
                variant="danger"
                icon={Trash2}
                disabled={batchModerationMutation.isPending}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
          <SearchInput
            value={search}
            onChange={(val) => {
              setSearch(val);
              setPage(1);
            }}
            placeholder="Buscar..."
          />
          <FilterDropdown
            label="Tipo"
            value={typeFilter}
            onChange={(v) => {
              setTypeFilter(v);
              setPage(1);
            }}
            options={[
              { value: '', label: 'Todos' },
              { value: 'POST', label: 'Posts' },
              { value: 'STORY', label: 'Historias' },
              { value: 'COMMENT', label: 'Comentarios' },
            ]}
          />
        </div>
      </div>

      <div className="glass-panel rounded-2xl overflow-clip border border-white/10">
        <Table
          headers={[
            <input
              key="select-all"
              type="checkbox"
              className="rounded border-white/20 bg-white/5 text-brand-primary focus:ring-brand-primary/50"
              checked={
                selectedIds.size === data?.data.length && data?.data.length > 0
              }
              onChange={toggleSelectAll}
            />,
            'Contenido',
            'Motivo de Flag',
            'Estado Actual',
            'Autor',
            'Acciones',
          ]}
          loading={isLoading}
          isEmpty={!data || data.data.length === 0}
        >
          {data?.data.map((item) => (
            <motion.tr
              key={item.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={clsx(
                'hover:bg-white/[0.07] transition-colors border-b border-white/5 last:border-0',
                selectedIds.has(item.id) && 'bg-brand-primary/5',
              )}
            >
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  className="rounded border-white/20 bg-white/5 text-brand-primary focus:ring-brand-primary/50"
                  checked={selectedIds.has(item.id)}
                  onChange={() => toggleSelect(item.id)}
                />
              </td>

              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-white/5 overflow-hidden shrink-0 border border-white/10">
                    {item.media?.[0]?.url ? (
                      <img
                        src={item.media[0].url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-white/5">
                        <Eye size={16} className="text-gray-600" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-white text-sm truncate max-w-[200px] font-bold">
                      {item.caption || '(Sin texto)'}
                    </p>
                    <p className="text-[10px] text-gray-500 uppercase font-black tracking-wider">
                      {item.type}
                    </p>
                  </div>
                </div>
              </td>

              <td className="px-4 py-3">
                <div className="max-w-[250px]">
                  <p className="text-xs text-amber-200/80 leading-relaxed italic">
                    {item.moderationNote?.replace(
                      '[AI Automated Flag]: ',
                      '',
                    ) || 'Flagged by general filter'}
                  </p>
                </div>
              </td>

              <td className="px-4 py-3">
                <span
                  className={clsx(
                    'px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border',
                    item.moderationStatus === 'HIDDEN'
                      ? 'bg-red-500/10 text-red-500 border-red-500/20'
                      : 'bg-amber-500/10 text-amber-500 border-amber-500/20',
                  )}
                >
                  {item.moderationStatus === 'HIDDEN' ? 'OCULTO' : 'MARCADO'}
                </span>
              </td>

              <td className="px-4 py-3">
                <span className="text-gray-300 text-sm font-medium">
                  @{item.user?.profile?.username}
                </span>
              </td>

              <td className="px-4 py-3">
                <div className="flex gap-1.5 items-center">
                  <ActionButton
                    onClick={() => setPreviewPost(item)}
                    label="Ver"
                    variant="ghost"
                    icon={Eye}
                    iconOnly
                  />
                  <ActionButton
                    onClick={() =>
                      moderationMutation.mutate({
                        id: item.id,
                        type: item.type as any,
                        status: 'VISIBLE',
                        note: 'Aprobado manualmente por admin',
                      })
                    }
                    label="Aprobar"
                    variant="success"
                    icon={CheckCircle}
                    iconOnly
                    disabled={moderationMutation.isPending}
                  />
                  <ActionButton
                    onClick={() =>
                      setActionItem({
                        id: item.id,
                        type: item.type,
                        status: 'REMOVED',
                      })
                    }
                    label="Eliminar"
                    variant="danger"
                    icon={Trash2}
                    iconOnly
                    disabled={moderationMutation.isPending}
                  />
                </div>
              </td>
            </motion.tr>
          ))}
        </Table>
        <Pagination meta={data?.meta} onPageChange={setPage} />
      </div>

      {/* Preview Modal */}
      {previewPost && (
        <PostPreviewModal
          post={previewPost}
          onClose={() => setPreviewPost(null)}
        />
      )}

      {/* Action Confirm Modal */}
      <ConfirmModal
        isOpen={actionItem !== null}
        onClose={() => setActionItem(null)}
        onConfirm={() =>
          actionItem &&
          moderationMutation.mutate({
            id: actionItem.id,
            type: actionItem.type,
            status: actionItem.status,
            note: 'Eliminado permanentemente por moderación',
          })
        }
        title="¿Confirmar acción?"
        message="Esta acción eliminará el contenido permanentemente de la plataforma."
        confirmText="Confirmar"
        cancelText="Cancelar"
        isDestructive={true}
        isLoading={moderationMutation.isPending}
      />
    </div>
  );
}
