import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminApi, type FirewallSignature } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import ConfirmModal from '../modals/ConfirmModal';
import { Button } from '../ui';
import AdminDrawer from './AdminDrawer';
import { AdminList, AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { ActionButton, Pagination, Table } from './AdminTable';

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
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  const addMutation = useMutation({
    mutationFn: () => adminApi.addFirewallSignature(newText, newCategory),
    onSuccess: () => {
      onToast(t('admin.firewall.toast_added'), 'success');
      setNewText('');
      setNewCategory('SPAM');
      setDrawerOpen(false);
      queryClient.invalidateQueries({ queryKey: ['admin', 'firewall'] });
    },
    onError: () => onToast(t('admin.firewall.toast_add_error'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteFirewallSignature(id),
    onSuccess: () => {
      onToast(t('admin.firewall.toast_deleted'), 'success');
      setDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'firewall'] });
    },
    onError: () => onToast(t('admin.firewall.toast_delete_error'), 'error'),
  });

  const items = data?.data || [];

  const autoPreview = (
    <span className="text-gray-500 italic font-normal">
      {t('admin.firewall.auto_vector_preview')}
    </span>
  );

  return (
    <div className="flex flex-col space-y-6">
      <AdminPageHeader
        title={t('admin.firewall.title')}
        subtitle={t('admin.firewall.subtitle')}
        actions={
          <Button
            onClick={() => setDrawerOpen(true)}
            className="min-h-11 w-full sm:w-auto"
          >
            <Plus size={16} className="mr-2" />
            {t('admin.firewall.add_rule')}
          </Button>
        }
      />

      <div className="rounded-xl border border-white/10 lg:overflow-clip">
        <AdminList
          loading={isLoading}
          isEmpty={items.length === 0}
          emptyTitle={t('admin.firewall.empty_title')}
          emptyDescription={t('admin.firewall.empty_description')}
          emptyAction={
            <Button onClick={() => setDrawerOpen(true)} className="min-h-11">
              {t('admin.firewall.empty_action')}
            </Button>
          }
          mobile={
            <div className="space-y-2 p-2 lg:p-0">
              {items.map((item) => (
                <AdminListRow
                  key={item.id}
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
              ))}
            </div>
          }
          desktop={
            <Table
              headers={[
                t('admin.firewall.col_preview'),
                t('admin.firewall.col_category'),
                t('admin.firewall.col_created'),
                t('admin.firewall.col_actions'),
              ]}
              loading={false}
              isEmpty={false}
            >
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-white/[0.07] transition-colors border-b border-white/5 last:border-0"
                >
                  <td className="px-2 py-2">
                    <div className="text-sm text-white max-w-md truncate">
                      {getTextPreview(item) || (
                        <span className="text-gray-500 italic">
                          {t('admin.firewall.auto_vector_preview')}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-500 font-mono mt-1">
                      {t('admin.firewall.id_prefix', {
                        id: item.id.split('-')[0],
                      })}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <CategoryBadge category={item.category} />
                  </td>
                  <td className="px-2 py-2 text-sm text-gray-300">
                    {formatCreatedAt(item.createdAt)}
                  </td>
                  <td className="px-2 py-2">
                    <ActionButton
                      variant="danger"
                      label={t('admin.firewall.action_delete')}
                      icon={Trash2}
                      iconOnly
                      onClick={() => setDeleteId(item.id)}
                      disabled={deleteMutation.isPending}
                    />
                  </td>
                </tr>
              ))}
            </Table>
          }
        />

        {data?.meta && data.meta.totalPages > 1 && (
          <div className="p-4 border-t border-white/5">
            <Pagination meta={data.meta} onPageChange={setPage} />
          </div>
        )}
      </div>

      <AdminDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={t('admin.firewall.drawer_title')}
        subtitle={t('admin.firewall.drawer_subtitle')}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addMutation.mutate();
          }}
          className="space-y-4 mt-4"
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
          <Button
            type="submit"
            disabled={!newText.trim() || addMutation.isPending}
            isLoading={addMutation.isPending}
            className="min-h-11 w-full font-semibold"
          >
            {t('admin.firewall.generate_vector')}
          </Button>
        </form>
      </AdminDrawer>

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
