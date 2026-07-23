import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Shield, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminApi, type FirewallSignature } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import ConfirmModal from '../modals/ConfirmModal';
import { Button } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
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

function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="px-2 py-1 bg-red-500/10 text-red-400 text-xs font-semibold rounded-full border border-red-500/20">
      {category.toUpperCase()}
    </span>
  );
}

function getTextPreview(item: FirewallSignature) {
  return item.textPreview ?? item.text;
}

export default function FirewallTab({ onToast }: Props) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState('SPAM');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<PaginatedResponse<FirewallSignature>>({
    queryKey: ['admin', 'firewall', page],
    queryFn: () =>
      adminApi
        .getFirewallSignatures(page, 20)
        .then((res) => res.data as PaginatedResponse<FirewallSignature>),
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
    setNewText('');
    setNewCategory('SPAM');
  };

  const openCreate = () => {
    setNewText('');
    setNewCategory('SPAM');
    setSelectedId('new');
  };

  const addMutation = useMutation({
    mutationFn: () => adminApi.addFirewallSignature(newText, newCategory),
    onSuccess: () => {
      onToast(t('admin.firewall.toast_added'), 'success');
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ['admin', 'firewall'] });
    },
    onError: () => onToast(t('admin.firewall.toast_add_error'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteFirewallSignature(id),
    onSuccess: (_data, id) => {
      onToast(t('admin.firewall.toast_deleted'), 'success');
      setDeleteId(null);
      if (selectedId === id) setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'firewall'] });
    },
    onError: () => onToast(t('admin.firewall.toast_delete_error'), 'error'),
  });

  const autoPreview = (
    <span className="text-gray-500 italic font-normal">
      {t('admin.firewall.auto_vector_preview')}
    </span>
  );

  return (
    <div className="flex flex-col space-y-4">
      <AdminPageHeader
        title={t('admin.firewall.title')}
        subtitle={t('admin.firewall.subtitle')}
        actions={
          <Button onClick={openCreate} className="min-h-11 w-full sm:w-auto">
            <Plus size={16} className="mr-2" />
            {t('admin.firewall.add_rule')}
          </Button>
        }
      />

      <AdminSplitView
        hasSelection={hasSelection}
        onBack={clearSelection}
        onClearSelection={clearSelection}
        listTitle={t('admin.firewall.title')}
        list={
          <div className="flex flex-col h-full min-h-0">
            <div className="flex-1 overflow-y-auto space-y-2 pb-2">
              {isLoading ? (
                <AdminListSkeleton rows={6} />
              ) : items.length === 0 ? (
                <AdminEmptyState
                  icon={Shield}
                  title={t('admin.firewall.empty_title')}
                  description={t('admin.firewall.empty_description')}
                  action={
                    <Button onClick={openCreate} className="min-h-11">
                      {t('admin.firewall.empty_action')}
                    </Button>
                  }
                  compact
                />
              ) : (
                items.map((item) => (
                  <AdminListRow
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={
                      selectedId === item.id
                        ? 'border-brand-primary/30 bg-brand-primary/10'
                        : undefined
                    }
                    title={getTextPreview(item) || autoPreview}
                    subtitle={t('admin.firewall.id_prefix', {
                      id: item.id.split('-')[0],
                    })}
                    badge={<CategoryBadge category={item.category} />}
                    meta={formatCreatedAt(item.createdAt)}
                    primaryAction={
                      <ActionButton
                        variant="danger"
                        label={t('admin.firewall.action_delete')}
                        icon={Trash2}
                        onClick={() => setDeleteId(item.id)}
                        disabled={deleteMutation.isPending}
                      />
                    }
                  />
                ))
              )}
            </div>
            {data?.meta && data.meta.totalPages > 1 && (
              <div className="shrink-0 pt-2 border-t border-white/5">
                <Pagination meta={data.meta} onPageChange={setPage} />
              </div>
            )}
          </div>
        }
        detail={
          isCreating ? (
            <div className="space-y-4 px-1">
              <div>
                <h3 className="text-base font-semibold text-white">
                  {t('admin.firewall.drawer_title')}
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  {t('admin.firewall.drawer_subtitle')}
                </p>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addMutation.mutate();
                }}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <label
                    htmlFor="firewall-text"
                    className="text-xs font-semibold uppercase tracking-wide text-gray-500 ml-1"
                  >
                    {t('admin.firewall.label_text')}
                  </label>
                  <input
                    id="firewall-text"
                    type="text"
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    placeholder={t('admin.firewall.placeholder_text')}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 min-h-11 text-sm text-white focus:outline-none focus:border-brand-primary transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="firewall-category"
                    className="text-xs font-semibold uppercase tracking-wide text-gray-500 ml-1"
                  >
                    {t('admin.firewall.label_category')}
                  </label>
                  <select
                    id="firewall-category"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 min-h-11 text-sm text-white focus:outline-none focus:border-brand-primary transition-colors"
                  >
                    <option value="SPAM" className="bg-surface-raised">
                      SPAM
                    </option>
                    <option value="HATE" className="bg-surface-raised">
                      HATE
                    </option>
                    <option value="SEXUAL" className="bg-surface-raised">
                      SEXUAL
                    </option>
                    <option value="VIOLENCE" className="bg-surface-raised">
                      VIOLENCE
                    </option>
                    <option value="SCAM" className="bg-surface-raised">
                      SCAM
                    </option>
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    onClick={clearSelection}
                    variant="secondary"
                    className="flex-1 min-h-11 font-semibold bg-white/5 border-transparent text-gray-300"
                  >
                    {t('admin.shared.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    disabled={!newText.trim() || addMutation.isPending}
                    isLoading={addMutation.isPending}
                    className="flex-1 min-h-11 font-semibold"
                  >
                    {t('admin.firewall.generate_vector')}
                  </Button>
                </div>
              </form>
            </div>
          ) : selectedItem ? (
            <div className="space-y-5 px-1">
              <div>
                <h3 className="text-base font-semibold text-white">
                  {t('admin.firewall.col_preview')}
                </h3>
                <p className="text-sm text-gray-300 mt-2 break-words">
                  {getTextPreview(selectedItem) || (
                    <span className="text-gray-500 italic">
                      {t('admin.firewall.auto_vector_preview')}
                    </span>
                  )}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {t('admin.firewall.col_category')}
                  </p>
                  <div className="mt-2">
                    <CategoryBadge category={selectedItem.category} />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {t('admin.firewall.col_created')}
                  </p>
                  <p className="text-sm text-gray-300 mt-2">
                    {formatCreatedAt(selectedItem.createdAt)}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  ID
                </p>
                <p className="text-xs text-gray-400 font-mono mt-2 break-all">
                  {selectedItem.id}
                </p>
              </div>
              <div className="pt-2">
                <ActionButton
                  variant="danger"
                  label={t('admin.firewall.action_delete')}
                  icon={Trash2}
                  onClick={() => setDeleteId(selectedItem.id)}
                  disabled={deleteMutation.isPending}
                />
              </div>
            </div>
          ) : null
        }
      />

      <ConfirmModal
        isOpen={!!deleteId}
        title={t('admin.firewall.confirm_delete_title')}
        message={t('admin.firewall.confirm_delete_message')}
        confirmText={t('admin.firewall.confirm_delete')}
        cancelText={t('admin.shared.cancel')}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        onClose={() => setDeleteId(null)}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
