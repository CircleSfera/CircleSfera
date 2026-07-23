import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, Eye, Ghost, ShieldAlert, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AdminPost } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import { LoadingSpinner } from '../index';
import ConfirmModal from '../modals/ConfirmModal';
import UserAvatar from '../UserAvatar';
import { Button } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminSplitView } from './AdminSplitView';
import {
  ActionButton,
  FilterDropdown,
  Pagination,
  SearchInput,
} from './AdminTable';
import AppealsList from './AppealsList';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export default function ModerationTab({ onToast }: Props) {
  const [viewMode, setViewMode] = useState<'queue' | 'appeals'>('queue');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const debouncedSearch = useDebouncedValue(search, 400);
  const queryClient = useQueryClient();

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
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
          20,
          typeFilter || undefined,
          debouncedSearch || undefined,
        )
        .then((res) => res.data as PaginatedResponse<AdminPost>),
  });

  const items = data?.data || [];
  const selectedItem = items.find((i) => i.id === selectedItemId);

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

      // Auto-advance to next item
      if (selectedItemId) {
        const currentIndex = items.findIndex((i) => i.id === selectedItemId);
        if (currentIndex !== -1 && currentIndex + 1 < items.length) {
          setSelectedItemId(items[currentIndex + 1].id);
        } else {
          setSelectedItemId(null);
        }
      }

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
        const item = items.find((i) => i.id === id);
        if (!item) return Promise.resolve();
        return adminApi.updateModerationStatus(
          item.type as 'POST' | 'STORY' | 'COMMENT',
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

  const toggleSelect = (id: string, e: React.SyntheticEvent) => {
    e.stopPropagation();
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length && items.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  };

  return (
    <div className="flex flex-col min-h-0 space-y-4">
      <AdminPageHeader
        title="Cola de Moderación AI"
        subtitle="Contenido marcado automáticamente por el sistema"
        actions={
          <div className="flex gap-2 bg-white/5 p-1 rounded-lg w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setViewMode('queue')}
              className={`px-4 py-2.5 min-h-11 rounded-md text-sm font-semibold transition-colors ${viewMode === 'queue' ? 'bg-brand-primary text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Cola de Moderación
            </button>
            <button
              type="button"
              onClick={() => setViewMode('appeals')}
              className={`px-4 py-2.5 min-h-11 rounded-md text-sm font-semibold transition-colors ${viewMode === 'appeals' ? 'bg-brand-primary text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Apelaciones
            </button>
          </div>
        }
      />

      {viewMode === 'queue' && (
        <AdminFilterBar>
          <div className="flex-1 min-w-0">
            <SearchInput
              value={search}
              onChange={(val) => {
                setSearch(val);
                setPage(1);
              }}
              placeholder="Buscar..."
            />
          </div>
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
        </AdminFilterBar>
      )}

      {viewMode === 'appeals' ? (
        <AppealsList />
      ) : (
        <>
          {/* Batch Actions Bar */}
          <AnimatePresence>
            {selectedIds.size > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="flex items-center gap-2 p-2 bg-white/5 border border-white/10 rounded-lg shrink-0"
              >
                <span className="px-3 text-sm font-bold text-white">
                  {selectedIds.size} seleccionados
                </span>
                <ActionButton
                  onClick={() =>
                    batchModerationMutation.mutate({
                      status: 'VISIBLE',
                      note: 'Batch Approved',
                    })
                  }
                  label="Aprobar (Falso Positivo)"
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
                  label="Ocultar (Shadowban)"
                  variant="warning"
                  icon={Eye}
                  disabled={batchModerationMutation.isPending}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Split Pane Layout */}
          <AdminSplitView
            hasSelection={!!selectedItemId}
            onBack={() => setSelectedItemId(null)}
            listTitle="Cola de moderación"
            list={
              <div className="flex flex-col h-full min-h-0">
                <div className="p-3 border-b border-white/5 shrink-0 flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="rounded border-white/20 bg-white/5 text-brand-primary focus:ring-brand-primary/50"
                    checked={
                      selectedIds.size === items.length && items.length > 0
                    }
                    onChange={toggleSelectAll}
                  />
                  <h3 className="font-semibold text-white text-sm">
                    Seleccionar Todos
                  </h3>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {isLoading ? (
                    <div className="flex justify-center p-8">
                      <LoadingSpinner />
                    </div>
                  ) : items.length === 0 ? (
                    <AdminEmptyState
                      icon={ShieldAlert}
                      title="No hay contenido pendiente"
                      description="La cola de moderación está vacía."
                      compact
                    />
                  ) : (
                    items.map((item) => (
                      <AdminListRow
                        key={item.id}
                        onClick={() => setSelectedItemId(item.id)}
                        className={
                          selectedItemId === item.id
                            ? 'border-brand-primary/30 bg-brand-primary/10'
                            : undefined
                        }
                        title={item.caption || '(Sin texto)'}
                        subtitle={`@${item.user?.profile?.username || '—'}`}
                        meta={
                          <span className="text-red-400 truncate">
                            {item.moderationNote?.replace(
                              '[AI Automated Flag]: ',
                              '',
                            ) || 'Flagged'}
                          </span>
                        }
                        badge={
                          <span className="text-xs font-semibold uppercase text-amber-500">
                            {item.type}
                          </span>
                        }
                        avatar={
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              className="mt-1 rounded border-white/20 bg-white/5 text-brand-primary focus:ring-brand-primary/50"
                              checked={selectedIds.has(item.id)}
                              onChange={(e) => toggleSelect(item.id, e)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="w-12 h-12 rounded-lg bg-zinc-900 border border-white/10 overflow-hidden shrink-0">
                              {item.media?.[0]?.url ? (
                                <img
                                  src={
                                    item.media[0].thumbnailUrl ||
                                    item.media[0].url
                                  }
                                  alt=""
                                  className="w-full h-full object-cover"
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

                <div className="p-2 border-t border-white/5 shrink-0">
                  <Pagination meta={data?.meta} onPageChange={setPage} />
                </div>
              </div>
            }
            detail={
              <AnimatePresence mode="wait">
                {selectedItem ? (
                  <motion.div
                    key={selectedItem.id}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="flex flex-col h-full"
                  >
                    <div className="p-4 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between shrink-0 gap-3">
                      <div className="flex items-center gap-3">
                        <UserAvatar
                          src={selectedItem.user?.profile?.avatar || undefined}
                          alt={selectedItem.user?.profile?.username || 'User'}
                          size="sm"
                        />
                        <div>
                          <h3 className="text-sm font-semibold text-white">
                            @{selectedItem.user?.profile?.username}
                          </h3>
                          <p className="text-xs text-gray-300">
                            {new Date(selectedItem.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col xs:flex-row gap-2 w-full sm:w-auto">
                        <Button
                          onClick={() =>
                            moderationMutation.mutate({
                              id: selectedItem.id,
                              type: selectedItem.type as
                                | 'POST'
                                | 'STORY'
                                | 'COMMENT',
                              status: 'VISIBLE',
                              note: 'Aprobado (Falso Positivo)',
                            })
                          }
                          isLoading={moderationMutation.isPending}
                          variant="success"
                          className="min-h-11 text-sm font-semibold border-green-500/20 w-full sm:w-auto"
                        >
                          <CheckCircle size={16} className="mr-2" />
                          Aprobar (Seguro)
                        </Button>
                        <Button
                          onClick={() =>
                            setActionItem({
                              id: selectedItem.id,
                              type: selectedItem.type,
                              status: 'REMOVED',
                            })
                          }
                          variant="danger"
                          className="min-h-11 text-sm font-semibold border-red-500/20 w-full sm:w-auto"
                        >
                          <Trash2 size={16} className="mr-2" />
                          Eliminar
                        </Button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col items-center">
                      <div className="w-full max-w-2xl p-4 bg-red-500/10 border border-red-500/20 rounded-lg mb-6 flex items-start gap-4">
                        <ShieldAlert
                          className="text-red-500 shrink-0 mt-1"
                          size={24}
                        />
                        <div>
                          <h4 className="text-red-500 font-semibold mb-1">
                            Detección Automática AI
                          </h4>
                          <p className="text-sm text-red-200">
                            {selectedItem.moderationNote ||
                              'Contenido marcado por incumplimiento de las políticas.'}
                          </p>
                        </div>
                      </div>

                      <div className="w-full bg-zinc-900 border border-white/10 rounded-lg overflow-hidden shadow-2xl">
                        {selectedItem.media &&
                          selectedItem.media.length > 0 && (
                            <div className="relative aspect-4/5 bg-black">
                              {selectedItem.media[0].type?.includes('video') ? (
                                <video
                                  src={selectedItem.media[0].url}
                                  className="w-full h-full object-cover"
                                  controls
                                  muted
                                  playsInline
                                />
                              ) : (
                                <img
                                  src={selectedItem.media[0].url}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              )}
                              {selectedItem.media.length > 1 && (
                                <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full backdrop-blur-md">
                                  1/{selectedItem.media.length}
                                </div>
                              )}
                            </div>
                          )}

                        <div className="p-4">
                          {selectedItem.caption ? (
                            <p className="text-white text-sm whitespace-pre-wrap leading-relaxed">
                              {selectedItem.caption}
                            </p>
                          ) : (
                            <p className="text-gray-500 text-sm italic">
                              Sin texto
                            </p>
                          )}
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
                      icon={ShieldAlert}
                      title="Selecciona un elemento de la cola"
                      description="Para revisar el contenido reportado por la IA"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            }
          />

          {/* Action Confirm Modal */}
          <ConfirmModal
            isOpen={actionItem !== null}
            onClose={() => setActionItem(null)}
            onConfirm={() => {
              if (actionItem) {
                moderationMutation.mutate({
                  id: actionItem.id,
                  type: actionItem.type,
                  status: actionItem.status,
                  note: 'Eliminado permanentemente por moderación',
                });
              }
            }}
            title="¿Confirmar acción?"
            message="Esta acción eliminará el contenido permanentemente de la plataforma. ¿Estás seguro?"
            confirmText="Sí, Eliminar"
            cancelText="Cancelar"
            isDestructive={true}
            isLoading={moderationMutation.isPending}
          />
        </>
      )}
    </div>
  );
}
