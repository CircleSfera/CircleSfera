import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Edit2, Mail, Save, Trash2, User } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { WhitelistEntry } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import ConfirmModal from '../modals/ConfirmModal';
import { Button, Input, Select } from '../ui';
import AdminDrawer from './AdminDrawer';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminList, AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import {
  ActionButton,
  Pagination,
  SearchInput,
  StatusBadge,
  Table,
} from './AdminTable';

export default function WhitelistTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editingEntry, setEditingEntry] = useState<WhitelistEntry | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 400);

  const { data, isLoading } = useQuery<PaginatedResponse<WhitelistEntry>>({
    queryKey: ['admin', 'whitelist', page, debouncedSearch],
    queryFn: () =>
      adminApi
        .getWhitelist(page, 10, debouncedSearch || undefined)
        .then((res) => res.data as PaginatedResponse<WhitelistEntry>),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<WhitelistEntry> }) =>
      adminApi.updateWhitelist(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'whitelist'] });
      setEditingEntry(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteWhitelist(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'whitelist'] });
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

      <div className="rounded-xl border border-white/10 lg:overflow-clip">
        <AdminList
          loading={isLoading}
          isEmpty={!data || data.data.length === 0}
          emptyTitle={t('admin.whitelist.empty_title')}
          emptyDescription={t('admin.whitelist.empty_description')}
          mobile={
            <div className="space-y-2 p-2 lg:p-0">
              {data?.data.map((entry) => (
                <AdminListRow
                  key={entry.id}
                  title={entry.name || t('admin.whitelist.no_name')}
                  subtitle={entry.email}
                  badge={<StatusBadge status={entry.status} />}
                  meta={new Date(entry.createdAt).toLocaleDateString()}
                  primaryAction={
                    <ActionButton
                      variant="ghost"
                      label={t('admin.whitelist.action_edit')}
                      icon={Edit2}
                      onClick={() => setEditingEntry(entry)}
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
              ))}
            </div>
          }
          desktop={
            <Table
              headers={[
                t('admin.whitelist.col_name'),
                t('admin.whitelist.col_email'),
                t('admin.whitelist.col_status'),
                t('admin.whitelist.col_date'),
                t('admin.whitelist.col_actions'),
              ]}
              columnWidths={[
                'min-w-[8rem]',
                'min-w-[10rem]',
                'w-[6rem]',
                'hidden lg:table-cell w-[7rem]',
                'w-[5.5rem]',
              ]}
              loading={false}
              isEmpty={false}
            >
              {data?.data.map((entry) => (
                <tr
                  key={entry.id}
                  className="hover:bg-white/[0.07] transition-colors border-b border-white/5 last:border-0"
                >
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2 text-white font-semibold text-sm min-w-0">
                      <User size={14} className="text-gray-500 shrink-0" />
                      <span className="truncate">
                        {entry.name || t('admin.whitelist.no_name')}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-gray-300 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <Mail size={13} className="text-gray-500 shrink-0" />
                      <span className="truncate" title={entry.email}>
                        {entry.email}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <StatusBadge status={entry.status} />
                  </td>
                  <td className="px-2 py-2 text-gray-500 text-sm hidden lg:table-cell">
                    <div className="flex items-center gap-2">
                      <Calendar size={13} className="text-gray-500 shrink-0" />
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1">
                      <ActionButton
                        variant="ghost"
                        label={t('admin.whitelist.action_edit')}
                        icon={Edit2}
                        iconOnly
                        onClick={() => setEditingEntry(entry)}
                      />
                      <ActionButton
                        variant="danger"
                        label={t('admin.whitelist.action_delete')}
                        icon={Trash2}
                        iconOnly
                        onClick={() => handleDelete(entry.id)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          }
        />
        <Pagination meta={data?.meta} onPageChange={setPage} />
      </div>

      <AdminDrawer
        isOpen={!!editingEntry}
        onClose={() => setEditingEntry(null)}
        title={t('admin.whitelist.drawer_title')}
      >
        {editingEntry && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              updateMutation.mutate({
                id: editingEntry.id,
                data: {
                  name: formData.get('name') as string,
                  email: formData.get('email') as string,
                  status: formData.get('status') as WhitelistEntry['status'],
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
                defaultValue={editingEntry.name || ''}
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
                defaultValue={editingEntry.email}
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
                defaultValue={editingEntry.status}
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
                onClick={() => setEditingEntry(null)}
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
                <Save size={18} className="mr-2" /> {t('admin.whitelist.save')}
              </Button>
            </div>
          </form>
        )}
      </AdminDrawer>

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
