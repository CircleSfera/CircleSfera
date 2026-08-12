import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import {
  type AdminModerationRule,
  adminApi,
} from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import ConfirmModal from '../modals/ConfirmModal';
import { Button } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminListRow } from './AdminList';
import { AdminListSkeleton } from './AdminSkeletons';
import { AdminSplitView } from './AdminSplitView';
import { ActionButton, Pagination } from './AdminTable';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

function formatCreatedAt(date: string) {
  return new Date(date).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ActionBadge({ action }: { action: string }) {
  const colors =
    action === 'BLOCK'
      ? 'bg-red-500/10 text-red-400 border-red-500/20'
      : action === 'MUTE'
        ? 'bg-orange-500/10 text-orange-400 border-orange-500/20'
        : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';

  return (
    <span
      className={`px-2 py-1 text-xs font-semibold rounded-full border ${colors}`}
    >
      {action}
    </span>
  );
}

export default function FirewallRulesTab({ onToast }: Props) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newKeyword, setNewKeyword] = useState('');
  const [newAction, setNewAction] = useState('FLAG');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<PaginatedResponse<AdminModerationRule>>({
    queryKey: ['admin', 'firewall-rules', page, debouncedSearch],
    queryFn: () =>
      adminApi
        .getFirewallRules(page, 20, debouncedSearch)
        .then((res) => res.data as PaginatedResponse<AdminModerationRule>),
  });

  const items = data?.data || [];
  const selectedItem =
    selectedId && selectedId !== 'new'
      ? (items.find((item) => item.id === selectedId) ?? null)
      : null;
  const isCreating = selectedId === 'new';
  const hasSelection = isCreating || !!selectedItem;

  const clearSelection = () => {
    setSelectedId(null);
    setNewKeyword('');
    setNewAction('FLAG');
  };

  const openCreate = () => {
    setNewKeyword('');
    setNewAction('FLAG');
    setSelectedId('new');
  };

  const addMutation = useMutation({
    mutationFn: () =>
      adminApi.createFirewallRule({ keyword: newKeyword, action: newAction }),
    onSuccess: () => {
      onToast('Regla añadida', 'success');
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ['admin', 'firewall-rules'] });
    },
    onError: () => onToast('Error añadiendo regla', 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: (args: { id: string; action: string }) =>
      adminApi.updateFirewallRule(args.id, { action: args.action }),
    onSuccess: () => {
      onToast('Regla actualizada', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'firewall-rules'] });
    },
    onError: () => onToast('Error actualizando regla', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteFirewallRule(id),
    onSuccess: (_data, id) => {
      onToast('Regla borrada', 'success');
      setDeleteId(null);
      if (selectedId === id) setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'firewall-rules'] });
    },
    onError: () => onToast('Error borrando regla', 'error'),
  });

  const handleSave = () => {
    if (isCreating && newKeyword.trim()) {
      addMutation.mutate();
    }
  };

  return (
    <>
      <AdminSplitView
        hasSelection={hasSelection}
        list={
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-3 p-4 border-b border-white/5">
              <input
                type="text"
                placeholder={t('admin.shared.search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-brand-primary transition-colors"
              />
              <Button
                onClick={openCreate}
                variant="primary"
                className="gap-2 shrink-0 px-4 min-h-10"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {t('admin.shared.add')}
                </span>
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <AdminListSkeleton />
              ) : items.length === 0 ? (
                <AdminEmptyState
                  icon={ShieldAlert}
                  title={t('admin.firewall.empty_static_title')}
                  description={t('admin.firewall.empty_static_description')}
                />
              ) : (
                <div className="divide-y divide-white/5">
                  {items.map((item) => (
                    <AdminListRow
                      key={item.id}
                      title={item.keyword}
                      subtitle={t('admin.firewall.added_on', {
                        date: formatCreatedAt(item.createdAt),
                      })}
                      selected={selectedId === item.id}
                      onClick={() => setSelectedId(item.id)}
                      badge={<ActionBadge action={item.action} />}
                    />
                  ))}
                </div>
              )}
            </div>

            {data?.meta && data.meta.totalPages > 1 && (
              <div className="p-4 border-t border-white/5 bg-white/2">
                <Pagination meta={data.meta} onPageChange={setPage} />
              </div>
            )}
          </div>
        }
        detail={
          hasSelection ? (
            <div className="h-full flex flex-col p-4 md:p-5 animate-in fade-in slide-in-from-right-4 duration-200">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">
                    {isCreating
                      ? t('admin.firewall.new_rule')
                      : t('admin.firewall.rule_details')}
                  </h3>
                  <p className="text-sm text-white/50">
                    {isCreating
                      ? t(
                          'admin.firewall.new_rule_hint',
                          'Define an exact word or phrase to intercept.',
                        )
                      : t(
                          'admin.firewall.rule_details_hint',
                          'Information for the selected rule.',
                        )}
                  </p>
                </div>
                {!isCreating && selectedItem && (
                  <ActionButton
                    icon={Trash2}
                    label={t('admin.shared.delete')}
                    variant="danger"
                    onClick={() => setDeleteId(selectedItem.id)}
                  />
                )}
              </div>

              {isCreating ? (
                <div className="space-y-6 max-w-md">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="ruleKeyword"
                      className="text-xs font-semibold uppercase tracking-wide text-white/40 ml-1"
                    >
                      Palabra Clave o Frase
                    </label>
                    <input
                      id="ruleKeyword"
                      type="text"
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      placeholder="ej. spamcasino.com"
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 min-h-11 text-sm text-white focus:outline-none focus:border-brand-primary transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="ruleAction"
                      className="text-xs font-semibold uppercase tracking-wide text-white/40 ml-1"
                    >
                      Acción
                    </label>
                    <select
                      id="ruleAction"
                      value={newAction}
                      onChange={(e) => setNewAction(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 min-h-11 text-sm text-white focus:outline-none focus:border-brand-primary transition-colors"
                    >
                      <option value="FLAG" className="bg-surface-raised">
                        FLAG (Enviar a Cola AI para revisión)
                      </option>
                      <option value="BLOCK" className="bg-surface-raised">
                        BLOCK (Prohibir publicación inmediatamente)
                      </option>
                      <option value="MUTE" className="bg-surface-raised">
                        MUTE (Publicar pero ocultar a otros usuarios)
                      </option>
                    </select>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Button
                      type="button"
                      onClick={clearSelection}
                      variant="secondary"
                      className="flex-1 min-h-11 font-semibold bg-white/5 border-transparent text-white/70"
                    >
                      {t('admin.shared.cancel')}
                    </Button>
                    <Button
                      type="button"
                      onClick={handleSave}
                      disabled={!newKeyword.trim() || addMutation.isPending}
                      variant="primary"
                      className="flex-1 min-h-11 font-semibold shadow-lg shadow-brand-primary/20"
                    >
                      {addMutation.isPending
                        ? t('admin.firewall.saving')
                        : t('admin.firewall.save_rule')}
                    </Button>
                  </div>
                </div>
              ) : selectedItem ? (
                <div className="space-y-8">
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                    <h4 className="text-sm font-medium text-white/50 mb-2">
                      Palabra Clave Interceptada
                    </h4>
                    <p className="text-lg text-white font-mono bg-black/20 p-3 rounded-lg border border-white/5">
                      {selectedItem.keyword}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
                      <p className="text-xs font-medium text-white/50 mb-1">
                        Acción Actual
                      </p>
                      <div className="mt-1">
                        <ActionBadge action={selectedItem.action} />
                      </div>
                    </div>
                    <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
                      <p className="text-xs font-medium text-white/50 mb-1">
                        Creado el
                      </p>
                      <p className="text-sm text-white/80">
                        {formatCreatedAt(selectedItem.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-white/10">
                    <h4 className="text-sm font-semibold text-white">
                      Cambiar Acción
                    </h4>
                    <div className="flex flex-col gap-2">
                      <Button
                        variant={
                          selectedItem.action === 'FLAG'
                            ? 'primary'
                            : 'secondary'
                        }
                        className="justify-start min-h-11"
                        onClick={() =>
                          updateMutation.mutate({
                            id: selectedItem.id,
                            action: 'FLAG',
                          })
                        }
                        disabled={
                          updateMutation.isPending ||
                          selectedItem.action === 'FLAG'
                        }
                      >
                        FLAG - Enviar a Cola de Revisión
                      </Button>
                      <Button
                        variant={
                          selectedItem.action === 'BLOCK'
                            ? 'danger'
                            : 'secondary'
                        }
                        className="justify-start min-h-11"
                        onClick={() =>
                          updateMutation.mutate({
                            id: selectedItem.id,
                            action: 'BLOCK',
                          })
                        }
                        disabled={
                          updateMutation.isPending ||
                          selectedItem.action === 'BLOCK'
                        }
                      >
                        BLOCK - Prohibir Publicación
                      </Button>
                      <Button
                        variant={
                          selectedItem.action === 'MUTE'
                            ? 'primary'
                            : 'secondary'
                        }
                        className="justify-start min-h-11"
                        onClick={() =>
                          updateMutation.mutate({
                            id: selectedItem.id,
                            action: 'MUTE',
                          })
                        }
                        disabled={
                          updateMutation.isPending ||
                          selectedItem.action === 'MUTE'
                        }
                      >
                        MUTE - Shadowban de contenido
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center p-6 text-center">
              <div className="max-w-xs space-y-4">
                <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-6 ring-1 ring-white/10">
                  <ShieldAlert className="w-6 h-6 text-white/50" />
                </div>
                <h3 className="text-lg font-semibold text-white">
                  Selecciona una Regla
                </h3>
                <p className="text-sm text-white/50 leading-relaxed">
                  Elige una regla de la lista para ver sus detalles o añade una
                  nueva para interceptar texto.
                </p>
              </div>
            </div>
          )
        }
      />

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        title={t('admin.firewall.delete_title')}
        message={t('admin.firewall.delete_desc')}
        confirmText={t('admin.shared.delete')}
        cancelText={t('admin.shared.cancel')}
        isDestructive
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}
