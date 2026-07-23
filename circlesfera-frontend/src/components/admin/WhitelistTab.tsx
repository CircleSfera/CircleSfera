import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { WhitelistEntry } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import ConfirmModal from '../modals/ConfirmModal';
import { Button, Input, Select } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminListSkeleton } from './AdminSkeletons';
import { AdminSplitView } from './AdminSplitView';
import {
  ActionButton,
  Pagination,
  SearchInput,
  StatusBadge,
} from './AdminTable';

export default function WhitelistTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 400);

  const { data, isLoading } = useQuery<PaginatedResponse<WhitelistEntry>>({
    queryKey: ['admin', 'whitelist', page, debouncedSearch],
    queryFn: () =>
      adminApi
        .getWhitelist(page, 10, debouncedSearch || undefined)
        .then((res) => res.data as PaginatedResponse<WhitelistEntry>),
  });

  const entries = data?.data ?? [];
  const selectedEntry =
    entries.find((entry) => entry.id === selectedId) ?? null;

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<WhitelistEntry> }) =>
      adminApi.updateWhitelist(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'whitelist'] });
      setSelectedId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteWhitelist(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'whitelist'] });
      if (selectedId === id) setSelectedId(null);
    },
  });

  const handleDelete = (id: string) => {
    setConfirmDeleteId(id);
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t('admin.whitelist.title')}
        subtitle={t('admin.whitelist.subtitle')}
        actions={
          <div className="text-xs text-gray-400 bg-white/5 px-3 py-2 rounded-lg border border-white/10 italic min-h-11 flex items-center">
            {t('admin.whitelist.total_count', {
              count: data?.meta.total || 0,
            })}
          </div>
        }
      />

      <AdminFilterBar>
        <div className="flex-1 min-w-0">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder={t('admin.whitelist.search_placeholder')}
          />
        </div>
      </AdminFilterBar>

      <AdminSplitView
        hasSelection={!!selectedEntry}
        onBack={() => setSelectedId(null)}
        onClearSelection={() => setSelectedId(null)}
        listTitle={t('admin.whitelist.title')}
        list={
          <div className="flex flex-col h-full min-h-0">
            <div className="flex-1 overflow-y-auto space-y-2 pb-2">
              {isLoading ? (
                <AdminListSkeleton rows={6} />
              ) : entries.length === 0 ? (
                <AdminEmptyState
                  icon={UserCheck}
                  title={t('admin.whitelist.empty_title')}
                  description={t('admin.whitelist.empty_description')}
                  compact
                />
              ) : (
                entries.map((entry) => (
                  <AdminListRow
                    key={entry.id}
                    onClick={() => setSelectedId(entry.id)}
                    className={
                      selectedId === entry.id
                        ? 'border-brand-primary/30 bg-brand-primary/10'
                        : undefined
                    }
                    title={entry.name || t('admin.whitelist.no_name')}
                    subtitle={entry.email}
                    badge={<StatusBadge status={entry.status} />}
                    meta={new Date(entry.createdAt).toLocaleDateString()}
                    primaryAction={
                      <ActionButton
                        variant="ghost"
                        label={t('admin.whitelist.action_edit')}
                        onClick={() => setSelectedId(entry.id)}
                      />
                    }
                    secondaryActions={[
                      {
                        label: t('admin.whitelist.action_delete'),
                        variant: 'danger',
                        onClick: () => handleDelete(entry.id),
                      },
                    ]}
                  />
                ))
              )}
            </div>
            <div className="shrink-0 pt-2 border-t border-white/5">
              <Pagination meta={data?.meta} onPageChange={setPage} />
            </div>
          </div>
        }
        detail={
          selectedEntry ? (
            <div className="space-y-4 px-1">
              <div>
                <h3 className="text-base font-semibold text-white">
                  {t('admin.whitelist.drawer_title')}
                </h3>
              </div>
              <form
                key={selectedEntry.id}
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  updateMutation.mutate({
                    id: selectedEntry.id,
                    data: {
                      name: formData.get('name') as string,
                      email: formData.get('email') as string,
                      status: formData.get(
                        'status',
                      ) as WhitelistEntry['status'],
                    },
                  });
                }}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <label
                    htmlFor="whitelist-name"
                    className="text-xs font-semibold uppercase tracking-wide text-gray-500 ml-1"
                  >
                    {t('admin.whitelist.label_name')}
                  </label>
                  <Input
                    id="whitelist-name"
                    name="name"
                    type="text"
                    defaultValue={selectedEntry.name || ''}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="whitelist-email"
                    className="text-xs font-semibold uppercase tracking-wide text-gray-500 ml-1"
                  >
                    {t('admin.whitelist.label_email')}
                  </label>
                  <Input
                    id="whitelist-email"
                    name="email"
                    type="email"
                    defaultValue={selectedEntry.email}
                    required
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="whitelist-status"
                    className="text-xs font-semibold uppercase tracking-wide text-gray-500 ml-1"
                  >
                    {t('admin.whitelist.label_status')}
                  </label>
                  <Select
                    id="whitelist-status"
                    name="status"
                    defaultValue={selectedEntry.status}
                  >
                    <option value="VALID" className="bg-surface-raised">
                      VALID
                    </option>
                    <option value="REGISTERED" className="bg-surface-raised">
                      REGISTERED
                    </option>
                  </Select>
                </div>

                <div className="pt-4 flex gap-3">
                  <Button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    variant="secondary"
                    className="flex-1 min-h-11 font-semibold bg-white/5 border-transparent text-gray-300"
                  >
                    {t('admin.shared.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    isLoading={updateMutation.isPending}
                    variant="primary"
                    className="flex-1 min-h-11 font-semibold shadow-lg shadow-brand-primary/20"
                  >
                    <Save size={18} className="mr-2" />{' '}
                    {t('admin.whitelist.save')}
                  </Button>
                </div>
              </form>
            </div>
          ) : null
        }
      />

      <ConfirmModal
        isOpen={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          if (confirmDeleteId) {
            deleteMutation.mutate(confirmDeleteId);
          }
          setConfirmDeleteId(null);
        }}
        title={t('admin.whitelist.confirm_delete_title')}
        message={t('admin.whitelist.confirm_delete_message')}
        confirmText={t('admin.whitelist.confirm_delete')}
        cancelText={t('admin.shared.cancel')}
        isDestructive={true}
      />
    </div>
  );
}
