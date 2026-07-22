import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Edit2, Key, Trash2, User } from 'lucide-react';
import { useState } from 'react';

import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { UserExperiment } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import { Button, Input, Select } from '../ui';
import AdminDrawer from './AdminDrawer';
import { ActionButton, Pagination, SearchInput, Table } from './AdminTable';

export default function ExperimentsTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [editingEntry, setEditingEntry] = useState<UserExperiment | null>(null);
  const debouncedSearch = useDebouncedValue(search, 400);

  const { data, isLoading } = useQuery<PaginatedResponse<UserExperiment>>({
    queryKey: ['admin', 'experiments', page, debouncedSearch],
    queryFn: () =>
      adminApi
        .getUserExperiments(page, 20, debouncedSearch || undefined)
        .then(
          (res) => res.data as unknown as PaginatedResponse<UserExperiment>,
        ),
  });

  const assignMutation = useMutation({
    mutationFn: (payload: {
      userId: string;
      experimentKey: string;
      variant: string;
    }) =>
      adminApi.assignUserExperiment(
        payload.userId,
        payload.experimentKey,
        payload.variant,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'experiments'] });
      setIsAssigning(false);
      setEditingEntry(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.removeUserExperiment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'experiments'] });
    },
  });

  const handleDelete = (id: string) => {
    if (
      confirm(
        '¿Estás seguro de que deseas eliminar este experimento de usuario?',
      )
    ) {
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
          placeholder="Buscar por username o clave de experimento..."
        />
        <Button onClick={() => setIsAssigning(true)} size="sm">
          Asignar Experimento
        </Button>
      </div>

      <div className="glass-panel rounded-lg overflow-clip border border-white/10">
        <Table
          headers={['Usuario', 'Experimento', 'Variante', 'Fecha', 'Acciones']}
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
                  <User size={14} className="text-gray-500" />@
                  {entry.user.username}
                </div>
              </td>
              <td className="px-4 py-4">
                <div className="flex items-center gap-2 text-white font-bold text-xs uppercase tracking-wide">
                  <Key size={14} className="text-gray-500" />
                  {entry.experimentKey}
                </div>
              </td>
              <td className="px-4 py-4 text-xs font-bold">
                <span
                  className={`px-2 py-1 rounded-md bg-white/5 border border-white/10 ${entry.variant.toLowerCase() === 'true' || entry.variant.toLowerCase() === 'treatment' || entry.variant.toLowerCase() === 'on' ? 'text-green-400' : 'text-orange-400'}`}
                >
                  {entry.variant}
                </span>
              </td>
              <td className="px-4 py-4 text-gray-500 text-xs whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <Calendar size={13} className="text-gray-500" />
                  {new Date(entry.createdAt).toLocaleDateString()}
                </div>
              </td>
              <td className="px-4 py-4">
                <div className="flex items-center gap-2">
                  <ActionButton
                    icon={Edit2}
                    onClick={() => {
                      setEditingEntry(entry);
                      setIsAssigning(true);
                    }}
                    label="Editar Variante"
                    variant="ghost"
                    iconOnly
                  />
                  <ActionButton
                    icon={Trash2}
                    onClick={() => handleDelete(entry.id)}
                    variant="danger"
                    label="Eliminar"
                    iconOnly
                  />
                </div>
              </td>
            </tr>
          ))}
        </Table>
        {data && data.meta?.totalPages > 1 && (
          <Pagination meta={data.meta} onPageChange={setPage} />
        )}
      </div>

      <AdminDrawer
        isOpen={isAssigning}
        onClose={() => {
          setIsAssigning(false);
          setEditingEntry(null);
        }}
        title={editingEntry ? 'Editar Experimento' : 'Asignar Experimento'}
      >
        <ExperimentForm
          initialData={editingEntry}
          onSubmit={(payload) => assignMutation.mutate(payload)}
          isSubmitting={assignMutation.isPending}
        />
      </AdminDrawer>
    </div>
  );
}

function ExperimentForm({
  initialData,
  onSubmit,
  isSubmitting,
}: {
  initialData: UserExperiment | null;
  onSubmit: (data: {
    userId: string;
    experimentKey: string;
    variant: string;
  }) => void;
  isSubmitting: boolean;
}) {
  const [userId, setUserId] = useState(initialData?.userId || '');
  const [experimentKey, setExperimentKey] = useState(
    initialData?.experimentKey || '',
  );
  const [variant, setVariant] = useState(initialData?.variant || 'true');

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="userId"
          className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2 block"
        >
          ID de Usuario
        </label>
        <Input
          id="userId"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="Ej: f3d2..."
          disabled={!!initialData}
        />
      </div>

      <div>
        <label
          htmlFor="experimentKey"
          className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2 block"
        >
          Clave del Experimento
        </label>
        <Input
          id="experimentKey"
          value={experimentKey}
          onChange={(e) => setExperimentKey(e.target.value)}
          placeholder="Ej: beta_feature_x"
          disabled={!!initialData}
        />
      </div>

      <div>
        <label
          htmlFor="variant"
          className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2 block"
        >
          Variante
        </label>
        <Select
          id="variant"
          value={variant}
          onChange={(e) => setVariant(e.target.value)}
        >
          <option value="true">True / Activado</option>
          <option value="false">False / Desactivado</option>
          <option value="treatment">Treatment</option>
          <option value="control">Control</option>
        </Select>
      </div>

      <Button
        className="w-full mt-4"
        onClick={() => onSubmit({ userId, experimentKey, variant })}
        disabled={!userId || !experimentKey || !variant || isSubmitting}
      >
        {isSubmitting ? 'Guardando...' : 'Guardar'}
      </Button>
    </div>
  );
}
