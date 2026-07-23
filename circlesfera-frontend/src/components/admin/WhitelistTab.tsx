import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Edit2, Mail, Save, Trash2, User } from 'lucide-react';
import { useState } from 'react';
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
        title="Whitelist de Interesados"
        subtitle="Gestiona la lista de usuarios interesados en la plataforma."
        actions={
          <div className="text-xs text-gray-400 bg-white/5 px-3 py-2 rounded-lg border border-white/10 italic min-h-11 flex items-center">
            Total:{' '}
            <span className="text-white font-semibold ml-1">
              {data?.meta.total || 0}
            </span>{' '}
            interesados
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
            placeholder="Buscar en whitelist..."
          />
        </div>
      </AdminFilterBar>

      <div className="rounded-xl border border-white/10 lg:overflow-clip">
        <AdminList
          loading={isLoading}
          isEmpty={!data || data.data.length === 0}
          emptyTitle="No hay registros en whitelist"
          emptyDescription="No se encontraron interesados con los filtros seleccionados."
          mobile={
            <div className="space-y-2 p-2 lg:p-0">
              {data?.data.map((entry) => (
                <AdminListRow
                  key={entry.id}
                  title={entry.name || 'Sin nombre'}
                  subtitle={entry.email}
                  badge={<StatusBadge status={entry.status} />}
                  meta={new Date(entry.createdAt).toLocaleDateString()}
                  primaryAction={
                    <ActionButton
                      variant="ghost"
                      label="Editar"
                      icon={Edit2}
                      onClick={() => setEditingEntry(entry)}
                    />
                  }
                  secondaryActions={[
                    {
                      label: 'Eliminar',
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
              headers={['Nombre', 'Email', 'Estado', 'Fecha', 'Acciones']}
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
                        {entry.name || 'Sin nombre'}
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
                        label="Editar"
                        icon={Edit2}
                        iconOnly
                        onClick={() => setEditingEntry(entry)}
                      />
                      <ActionButton
                        variant="danger"
                        label="Eliminar"
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
        title="Editar Registro"
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
                Nombre
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
                Email
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
                Estado
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
                Cancelar
              </Button>
              <Button
                type="submit"
                isLoading={updateMutation.isPending}
                variant="primary"
                className="flex-1 min-h-11 font-semibold shadow-lg shadow-brand-primary/20"
              >
                <Save size={18} className="mr-2" /> Guardar
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
        title="¿Eliminar registro?"
        message="¿Estás seguro de que deseas eliminar este registro de la whitelist?"
        confirmText="Eliminar"
        cancelText="Cancelar"
        isDestructive={true}
      />
    </div>
  );
}
