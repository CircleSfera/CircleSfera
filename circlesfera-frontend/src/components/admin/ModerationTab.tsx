import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  CheckCircle,
  Eye,
  Ghost,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import type { AdminPost } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import { LoadingSpinner } from '../index';
import ConfirmModal from '../modals/ConfirmModal';
import UserAvatar from '../UserAvatar';
import { Button } from '../ui';
import {
  ActionButton,
  FilterDropdown,
  Pagination,
  SearchInput,
} from './AdminTable';

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
    <div className="flex flex-col h-[calc(100vh-12rem)] space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between shrink-0">
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
      <div className="flex flex-1 min-h-0 gap-4">
        {/* Left Pane: Queue */}
        <div
          className={`w-full lg:w-1/3 flex-col glass-panel rounded-lg border border-white/5 overflow-hidden shadow-lg ${selectedItemId ? 'hidden lg:flex' : 'flex'}`}
        >
          <div className="p-4 border-b border-white/5 shrink-0 bg-white/2 flex items-center gap-3">
            <input
              type="checkbox"
              className="rounded border-white/20 bg-white/5 text-brand-primary focus:ring-brand-primary/50"
              checked={selectedIds.size === items.length && items.length > 0}
              onChange={toggleSelectAll}
            />
            <h3 className="font-bold text-white text-sm">Seleccionar Todos</h3>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2 no-scrollbar">
            {isLoading ? (
              <div className="flex justify-center p-8">
                <LoadingSpinner />
              </div>
            ) : items.length === 0 ? (
              <div className="text-center p-8 text-gray-500 text-sm">
                No hay contenido pendiente de moderación
              </div>
            ) : (
              items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setSelectedItemId(item.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-all flex items-start gap-3 ${
                    selectedItemId === item.id
                      ? 'bg-brand-primary/10 border-brand-primary/30'
                      : 'bg-white/2 border-transparent hover:bg-white/5 hover:border-white/10'
                  }`}
                >
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
                        src={item.media[0].thumbnailUrl || item.media[0].url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-700">
                        <Ghost size={16} />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-black uppercase tracking-wide text-amber-500">
                        {item.type}
                      </span>
                      <span className="text-xs text-gray-500">
                        @{item.user?.profile?.username}
                      </span>
                    </div>
                    <p className="text-white text-sm truncate font-bold">
                      {item.caption || '(Sin texto)'}
                    </p>
                    <p className="text-xs text-red-400 mt-1 truncate">
                      {item.moderationNote?.replace(
                        '[AI Automated Flag]: ',
                        '',
                      ) || 'Flagged'}
                    </p>
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
          className={`flex-1 glass-panel rounded-lg border border-white/5 overflow-hidden shadow-lg flex-col relative ${selectedItemId ? 'flex' : 'hidden lg:flex'}`}
        >
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
                {/* Header Action Bar */}
                <div className="p-4 border-b border-white/5 bg-white/2 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => setSelectedItemId(null)}
                      className="lg:hidden p-2 -ml-2 text-gray-400 hover:text-white"
                    >
                      <ArrowLeft size={20} />
                    </button>
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        src={selectedItem.user?.profile?.avatar || undefined}
                        alt={selectedItem.user?.profile?.username || 'User'}
                        size="sm"
                      />
                      <div>
                        <h3 className="text-sm font-bold text-white">
                          @{selectedItem.user?.profile?.username}
                        </h3>
                        <p className="text-xs text-gray-400">
                          {new Date(selectedItem.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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
                      className="p-2 md:px-4 md:py-2 text-sm font-bold border-green-500/20"
                    >
                      <CheckCircle size={16} className="mr-2 hidden md:block" />{' '}
                      <span className="hidden md:inline">Aprobar (Seguro)</span>
                      <CheckCircle size={16} className="md:hidden" />
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
                      className="p-2 md:px-4 md:py-2 text-sm font-bold border-red-500/20"
                    >
                      <Trash2 size={16} className="mr-2 hidden md:block" />{' '}
                      <span className="hidden md:inline">Eliminar</span>
                      <Trash2 size={16} className="md:hidden" />
                    </Button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
                  {/* AI Warning Box */}
                  <div className="w-full max-w-2xl p-4 bg-red-500/10 border border-red-500/20 rounded-lg mb-6 flex items-start gap-4">
                    <ShieldAlert
                      className="text-red-500 shrink-0 mt-1"
                      size={24}
                    />
                    <div>
                      <h4 className="text-red-500 font-bold mb-1">
                        Detección Automática AI
                      </h4>
                      <p className="text-sm text-red-200">
                        {selectedItem.moderationNote ||
                          'Contenido marcado por incumplimiento de las políticas.'}
                      </p>
                    </div>
                  </div>

                  {/* Content Preview */}
                  <div className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-lg overflow-hidden shadow-2xl">
                    {/* Media */}
                    {selectedItem.media && selectedItem.media.length > 0 && (
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

                    {/* Text Content */}
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
                className="flex-1 flex flex-col items-center justify-center text-gray-500"
              >
                <ShieldAlert size={48} className="mb-4 text-white/10" />
                <p className="font-bold">Selecciona un elemento de la cola</p>
                <p className="text-sm">
                  Para revisar el contenido reportado por la IA
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

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
    </div>
  );
}
