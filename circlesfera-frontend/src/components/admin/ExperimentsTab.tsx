import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Edit2, Key, Trash2, User } from 'lucide-react';
import { useState } from 'react';

import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { UserExperiment } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import { Button, Input, Select } from '../ui';
import AdminDrawer from './AdminDrawer';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminList, AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { ActionButton, Pagination, SearchInput, Table } from './AdminTable';

function variantColorClass(variant: string) {
  const v = variant.toLowerCase();
  return v === 'true' || v === 'treatment' || v === 'on'
    ? 'text-green-400'
    : 'text-orange-400';
}

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
      <AdminPageHeader
        title="Experimentos A/B"
        subtitle="Gestión de variantes y asignaciones de experimentos"
        actions={
          <Button
            onClick={() => setIsAssigning(true)}
            className="min-h-11 w-full sm:w-auto"
          >
            Asignar Experimento
          </Button>
        }
      />

      <AdminFilterBar>
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Buscar por username o clave de experimento..."
        />
      </AdminFilterBar>

      <div className="rounded-xl border border-white/10 lg:overflow-clip">
        <AdminList
          loading={isLoading}
          isEmpty={!data || data.data.length === 0}
          emptyTitle="No hay experimentos"
          emptyDescription="No se encontraron asignaciones con los filtros seleccionados."
          mobile={
            <div className="space-y-2">
              {data?.data.map((entry) => (
                <AdminListRow
                  key={entry.id}
                  title={`@${entry.user.username}`}
                  subtitle={entry.experimentKey}
                  badge={
                    <span
                      className={`px-2 py-1 rounded-md bg-white/5 border border-white/10 text-xs font-semibold ${variantColorClass(entry.variant)}`}
                    >
                      {entry.variant}
                    </span>
                  }
                  meta={
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={12} />
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </span>
                  }
                  primaryAction={
                    <ActionButton
                      icon={Edit2}
                      onClick={() => {
                        setEditingEntry(entry);
                        setIsAssigning(true);
                      }}
                      label="Editar"
                      variant="ghost"
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
              headers={[
                'Usuario',
                'Experimento',
                'Variante',
                'Fecha',
                'Acciones',
              ]}
              loading={false}
              isEmpty={false}
            >
              {data?.data.map((entry) => (
                <tr
                  key={entry.id}
                  className="hover:bg-white/[0.07] transition-colors border-b border-white/5 last:border-0"
                >
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2 text-white font-semibold text-xs">
                      <User size={14} className="text-gray-500" />@
                      {entry.user.username}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2 text-white font-semibold text-xs uppercase tracking-wide">
                      <Key size={14} className="text-gray-500" />
                      {entry.experimentKey}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-xs font-semibold">
                    <span
                      className={`px-2 py-1 rounded-md bg-white/5 border border-white/10 ${variantColorClass(entry.variant)}`}
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
          }
        />
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
          className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2 block"
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
          className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2 block"
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
          className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2 block"
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
        className="w-full mt-4 min-h-11"
        onClick={() => onSubmit({ userId, experimentKey, variant })}
        disabled={!userId || !experimentKey || !variant || isSubmitting}
      >
        {isSubmitting ? 'Guardando...' : 'Guardar'}
      </Button>
    </div>
  );
}
