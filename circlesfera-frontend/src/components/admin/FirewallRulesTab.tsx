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
import { formatDay } from '../../utils/format';
import ConfirmModal from '../modals/ConfirmModal';
import { Button } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminListRow } from './AdminList';
import { AdminListSkeleton } from './AdminSkeletons';
import { AdminSplitView } from './AdminSplitView';
import { ActionButton, Pagination } from './AdminTable';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
  // The choice between the views of the section, shown in this view's bar.
  views?: React.ReactNode;
}

const RULE_ACTIONS = ['FLAG', 'BLOCK', 'MUTE'] as const;

// What a rule does, in words, with one colour each: red refuses, amber
// waits for a person, blue changes who sees it.
function ActionBadge({ action }: { action: string }) {
  const { t } = useTranslation();
  const colors =
    action === 'BLOCK'
      ? 'bg-red-500/10 text-red-400 border-red-500/20'
      : action === 'MUTE'
        ? 'bg-brand-blue/10 text-brand-blue border-brand-blue/20'
        : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';

  return (
    <span
      className={`px-2 py-1 text-xs font-semibold rounded-full border whitespace-nowrap ${colors}`}
    >
      {t(`admin.firewall.action_${action.toLowerCase()}`, {
        defaultValue: action,
      })}
    </span>
  );
}

export default function FirewallRulesTab({ onToast, views }: Props) {
  const { t, i18n } = useTranslation();
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
      adminApi.createFirewallRule({
        keyword: newKeyword.trim(),
        action: newAction,
      }),
    onSuccess: () => {
      onToast(t('admin.firewall.rule_added'), 'success');
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ['admin', 'firewall-rules'] });
    },
    onError: () => onToast(t('admin.firewall.rule_add_error'), 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      ...change
    }: {
      id: string;
      action?: string;
      isActive?: boolean;
    }) => adminApi.updateFirewallRule(id, change),
    onSuccess: () => {
      onToast(t('admin.firewall.rule_updated'), 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'firewall-rules'] });
    },
    onError: () => onToast(t('admin.firewall.rule_update_error'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteFirewallRule(id),
    onSuccess: (_data, id) => {
      onToast(t('admin.firewall.rule_deleted'), 'success');
      setDeleteId(null);
      if (selectedId === id) setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'firewall-rules'] });
    },
    onError: () => onToast(t('admin.firewall.rule_delete_error'), 'error'),
  });

  const handleSave = () => {
    if (isCreating && newKeyword.trim()) {
      addMutation.mutate();
    }
  };

  return (
    <div className="space-y-2.5">
      <AdminFilterBar>
        {views}
        <input
          type="text"
          placeholder={t('admin.shared.search')}
          aria-label={t('admin.firewall.search_rules')}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="flex-1 min-w-0 min-h-11 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-brand-primary transition-colors"
        />
        <Button
          onClick={openCreate}
          variant="primary"
          className="gap-2 shrink-0 px-4 min-h-11"
        >
          <Plus className="w-4 h-4" />
          <span>{t('admin.firewall.new_rule')}</span>
        </Button>
      </AdminFilterBar>

      <AdminSplitView
        hasSelection={hasSelection}
        onBack={clearSelection}
        onClearSelection={clearSelection}
        listAriaLabel={t('admin.firewall.tab_rules')}
        list={
          <div className="flex flex-col h-full">
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
                      // A rule that is switched off says so first.
                      subtitle={`${item.isActive ? '' : `${t('admin.firewall.state_off')} · `}${t(
                        'admin.firewall.added_on',
                        { date: formatDay(item.createdAt, i18n.language) },
                      )}`}
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
                <div className="min-w-0">
                  {/* The record of a rule is headed by its phrase. */}
                  <h3 className="text-lg font-bold text-white mb-1 wrap-break-word">
                    {isCreating
                      ? t('admin.firewall.new_rule')
                      : selectedItem?.keyword}
                  </h3>
                  <p className="text-sm text-white/50">
                    {isCreating
                      ? t('admin.firewall.new_rule_hint')
                      : selectedItem &&
                        t('admin.firewall.added_on', {
                          date: formatDay(
                            selectedItem.createdAt,
                            i18n.language,
                          ),
                        })}
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
                      className="text-xs font-semibold uppercase tracking-wide text-white/50 ml-1"
                    >
                      {t('admin.firewall.label_keyword')}
                    </label>
                    <input
                      id="ruleKeyword"
                      type="text"
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      placeholder={t('admin.firewall.keyword_placeholder')}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 min-h-11 text-sm text-white focus:outline-none focus:border-brand-primary transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="ruleAction"
                      className="text-xs font-semibold uppercase tracking-wide text-white/50 ml-1"
                    >
                      {t('admin.firewall.label_action')}
                    </label>
                    <select
                      id="ruleAction"
                      value={newAction}
                      onChange={(e) => setNewAction(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 min-h-11 text-sm text-white focus:outline-none focus:border-brand-primary transition-colors"
                    >
                      <option value="FLAG" className="bg-surface-raised">
                        {t('admin.firewall.option_flag')}
                      </option>
                      <option value="BLOCK" className="bg-surface-raised">
                        {t('admin.firewall.option_block')}
                      </option>
                      <option value="MUTE" className="bg-surface-raised">
                        {t('admin.firewall.option_mute')}
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
                // Sections under a thin line: no box inside the pane.
                <div>
                  <section className="space-y-2.5 pb-4">
                    <h4 className="text-sm font-semibold text-white">
                      {t('admin.firewall.change_action')}
                    </h4>
                    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                      {RULE_ACTIONS.map((action) => {
                        const chosen = selectedItem.action === action;
                        return (
                          <button
                            key={action}
                            type="button"
                            aria-pressed={chosen}
                            disabled={updateMutation.isPending}
                            onClick={() => {
                              if (!chosen)
                                updateMutation.mutate({
                                  id: selectedItem.id,
                                  action,
                                });
                            }}
                            className={`px-4 min-h-11 sm:min-h-9 py-2 sm:py-1.5 text-xs font-semibold rounded-full transition-all border inline-flex items-center justify-center disabled:opacity-60 ${
                              chosen
                                ? 'bg-brand-primary/20 text-white border-brand-primary/40'
                                : 'bg-white/5 text-white/60 border-white/10 hover:text-white/80 hover:bg-white/10'
                            }`}
                          >
                            {t(`admin.firewall.set_${action.toLowerCase()}`)}
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="space-y-2.5 pt-4 border-t border-white/10">
                    <h4 className="text-sm font-semibold text-white">
                      {t('admin.firewall.state_title')}
                    </h4>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-white/70 min-w-0">
                        {selectedItem.isActive
                          ? t('admin.firewall.state_on_hint')
                          : t('admin.firewall.state_off_hint')}
                      </p>
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-11 sm:min-h-9 px-4 text-xs font-semibold shrink-0"
                        disabled={updateMutation.isPending}
                        onClick={() =>
                          updateMutation.mutate({
                            id: selectedItem.id,
                            isActive: !selectedItem.isActive,
                          })
                        }
                      >
                        {selectedItem.isActive
                          ? t('admin.firewall.turn_off')
                          : t('admin.firewall.turn_on')}
                      </Button>
                    </div>
                  </section>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="h-full flex items-start justify-center pt-6 px-2 text-center">
              <div className="max-w-xs space-y-2.5 sm:space-y-3">
                <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-6 ring-1 ring-white/10">
                  <ShieldAlert className="w-6 h-6 text-white/50" />
                </div>
                <h3 className="text-lg font-semibold text-white">
                  {t('admin.firewall.select_rule_title')}
                </h3>
                <p className="text-sm text-white/50 leading-relaxed">
                  {t('admin.firewall.select_rule_description')}
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
    </div>
  );
}
