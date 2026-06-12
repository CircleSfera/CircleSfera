import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Edit2, Mail, Save, Trash2, User, X } from 'lucide-react';
import { useState } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import type { WhitelistEntry } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import { LoadingSpinner } from '../index';
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
  const debouncedSearch = useDebounce(search);

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
    if (confirm('¿Estás seguro de que deseas eliminar este registro?')) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Buscar en whitelist..."
        />
        <div className="text-xs text-gray-500 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10 italic">
          Total:{' '}
          <span className="text-white font-bold">{data?.meta.total || 0}</span>{' '}
          interesados
        </div>
      </div>

      <div className="glass-panel rounded-2xl overflow-clip border border-white/10">
        <Table
          headers={['Nombre', 'Email', 'Estado', 'Fecha', 'Acciones']}
          loading={isLoading}
          isEmpty={!data || data.data.length === 0}
        >
          {data?.data.map((entry) => (
            <tr
              key={entry.id}
              className="hover:bg-white/[0.07] transition-colors border-b border-white/5 last:border-0"
            >
              <td className="px-4 py-4">
                <div className="flex items-center gap-2 text-white font-bold text-xs">
                  <User size={14} className="text-gray-500" />
                  {entry.name || 'Sin nombre'}
                </div>
              </td>
              <td className="px-4 py-3 text-gray-400 text-xs">
                <div className="flex items-center gap-2">
                  <Mail size={13} className="text-gray-500" />
                  {entry.email}
                </div>
              </td>
              <td className="px-4 py-4">
                <StatusBadge status={entry.status} />
              </td>
              <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <Calendar size={13} className="text-gray-500" />
                  {new Date(entry.createdAt).toLocaleDateString()}
                </div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <div className="flex items-center gap-2">
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
        <Pagination meta={data?.meta} onPageChange={setPage} />
      </div>

      {/* Edit Modal */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-panel w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/2">
              <h3 className="text-white font-black uppercase tracking-widest text-sm">
                Editar Registro
              </h3>
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                className="p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-colors"
                aria-label="Cerrar modal"
              >
                <X size={20} />
              </button>
            </div>

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
              className="p-6 space-y-4"
            >
              <div className="space-y-1.5">
                <label
                  htmlFor="whitelist-name"
                  className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1"
                >
                  Nombre
                </label>
                <input
                  id="whitelist-name"
                  name="name"
                  type="text"
                  defaultValue={editingEntry.name || ''}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-brand-primary transition-colors"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="whitelist-email"
                  className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1"
                >
                  Email
                </label>
                <input
                  id="whitelist-email"
                  name="email"
                  type="email"
                  defaultValue={editingEntry.email}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-brand-primary transition-colors"
                  required
                  autoComplete="email"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="whitelist-status"
                  className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1"
                >
                  Estado
                </label>
                <select
                  id="whitelist-status"
                  name="status"
                  defaultValue={editingEntry.status}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-brand-primary transition-colors appearance-none cursor-pointer"
                >
                  <option value="VALID" className="bg-[#1a1a2e]">
                    VALID
                  </option>
                  <option value="REGISTERED" className="bg-[#1a1a2e]">
                    REGISTERED
                  </option>
                </select>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditingEntry(null)}
                  className="flex-1 py-3 px-4 bg-white/5 hover:bg-white/10 text-gray-300 font-bold rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="flex-1 py-3 px-4 bg-brand-primary hover:bg-brand-primary/80 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-brand-primary/20 transition-all flex items-center justify-center gap-2"
                >
                  {updateMutation.isPending ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <>
                      <Save size={18} />
                      Guardar
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
