import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Shield, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminApi, type FirewallSignature } from '../../services/admin.service';
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
import { isStepUpCancelled, useAdminStepUp } from './useAdminStepUp';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
  // The choice between the views of the section, shown in this view's bar.
  views?: React.ReactNode;
}

const CATEGORIES = ['SPAM', 'HATE', 'SEXUAL', 'VIOLENCE', 'SCAM'] as const;

// The kind of content a signature stands for, in words. It is a kind, not a
// verdict, so it has the colour of plain information.
function CategoryBadge({ category }: { category: string }) {
  const { t } = useTranslation();
  return (
    <span className="px-2 py-1 bg-brand-blue/10 text-brand-blue text-xs font-semibold rounded-full border border-brand-blue/20 whitespace-nowrap">
      {t(`admin.firewall.category_${category.toLowerCase()}`, {
        defaultValue: category,
      })}
    </span>
  );
}

function getTextPreview(item: FirewallSignature) {
  return item.textPreview ?? item.text;
}

export default function FirewallSignaturesTab({ onToast, views }: Props) {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState('SPAM');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const stepUp = useAdminStepUp();

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
    mutationFn: () =>
      adminApi.addFirewallSignature(newText.trim(), newCategory),
    onSuccess: () => {
      onToast(t('admin.firewall.toast_added'), 'success');
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ['admin', 'firewall'] });
    },
    onError: () => onToast(t('admin.firewall.toast_add_error'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      stepUp.run(() => adminApi.deleteFirewallSignature(id)),
    onSuccess: (_data, id) => {
      onToast(t('admin.firewall.toast_deleted'), 'success');
      setDeleteId(null);
      if (selectedId === id) setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'firewall'] });
    },
    onError: (err) => {
      if (isStepUpCancelled(err)) return;
      onToast(t('admin.firewall.toast_delete_error'), 'error');
    },
  });

  const autoPreview = (
    <span className="text-white/50 italic font-normal">
      {t('admin.firewall.auto_vector_preview')}
    </span>
  );

  return (
    <div className="space-y-2.5">
      {/* The section says its title once; this view adds only its bar. */}
      <AdminFilterBar>
        {views}
        <Button
          onClick={openCreate}
          className="min-h-11 w-full sm:w-auto sm:ml-auto"
        >
          <Plus size={16} className="mr-2" />
          {t('admin.firewall.new_signature')}
        </Button>
      </AdminFilterBar>

      <AdminSplitView
        hasSelection={hasSelection}
        onBack={clearSelection}
        onClearSelection={clearSelection}
        listAriaLabel={t('admin.firewall.title')}
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
                    selected={selectedId === item.id}
                    title={getTextPreview(item) || autoPreview}
                    subtitle={t('admin.firewall.added_on', {
                      date: formatDay(item.createdAt, i18n.language),
                    })}
                    badge={<CategoryBadge category={item.category} />}
                    secondaryActions={[
                      {
                        label: t('admin.firewall.action_delete'),
                        icon: Trash2,
                        variant: 'danger',
                        disabled: deleteMutation.isPending,
                        onClick: () => setDeleteId(item.id),
                      },
                    ]}
                  />
                ))
              )}
            </div>
            {data?.meta && data.meta.totalPages > 1 && (
              <div className="shrink-0">
                <Pagination meta={data.meta} onPageChange={setPage} />
              </div>
            )}
          </div>
        }
        detail={
          isCreating ? (
            <div className="space-y-2.5 sm:space-y-3 px-1">
              <div>
                <h3 className="text-base font-semibold text-white">
                  {t('admin.firewall.drawer_title')}
                </h3>
                <p className="text-sm text-white/50 mt-1">
                  {t('admin.firewall.drawer_subtitle')}
                </p>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addMutation.mutate();
                }}
                className="space-y-2.5"
              >
                <div className="space-y-1.5">
                  <label
                    htmlFor="firewall-text"
                    className="text-xs font-semibold uppercase tracking-wide text-white/50 ml-1"
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
                    className="text-xs font-semibold uppercase tracking-wide text-white/50 ml-1"
                  >
                    {t('admin.firewall.label_category')}
                  </label>
                  <select
                    id="firewall-category"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 min-h-11 text-sm text-white focus:outline-none focus:border-brand-primary transition-colors"
                  >
                    {CATEGORIES.map((category) => (
                      <option
                        key={category}
                        value={category}
                        className="bg-surface-raised"
                      >
                        {t(`admin.firewall.category_${category.toLowerCase()}`)}
                      </option>
                    ))}
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
            <div className="space-y-2.5 sm:space-y-3 px-1">
              <div>
                <h3 className="text-base font-semibold text-white">
                  {t('admin.firewall.col_preview')}
                </h3>
                <p className="text-sm text-white/70 mt-2 wrap-break-word">
                  {getTextPreview(selectedItem) || (
                    <span className="text-white/50 italic">
                      {t('admin.firewall.auto_vector_preview')}
                    </span>
                  )}
                </p>
              </div>
              <div className="grid gap-2 sm:gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
                    {t('admin.firewall.col_category')}
                  </p>
                  <div className="mt-2">
                    <CategoryBadge category={selectedItem.category} />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
                    {t('admin.firewall.col_created')}
                  </p>
                  <p className="text-sm text-white/70 mt-2">
                    {formatDay(selectedItem.createdAt, i18n.language)}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
                  ID
                </p>
                <p className="text-xs text-white/50 font-mono mt-2 break-all">
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
        isDestructive
        isLoading={deleteMutation.isPending}
      />
      {stepUp.dialog}
    </div>
  );
}
