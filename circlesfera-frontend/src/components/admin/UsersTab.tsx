import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Ban,
  Download,
  ExternalLink,
  Eye,
  ShieldCheck,
  ShieldOff,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AdminUser } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import { UserAvatar } from '../index';
import ConfirmModal from '../modals/ConfirmModal';
import { Button } from '../ui';
import VerificationBadge, {
  type VerificationLevel,
} from '../VerificationBadge';
import { AdminList, AdminListRow } from './AdminList';
import {
  ActionButton,
  FilterDropdown,
  Pagination,
  SearchInput,
  StatusBadge,
  Table,
} from './AdminTable';
import UserPreviewModal from './UserPreviewModal';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export default function UsersTab({ onToast }: Props) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const queryClient = useQueryClient();

  const [confirmAction, setConfirmAction] = useState<{
    type: 'ban' | 'unban' | 'promote' | 'demote' | 'delete' | null;
    id: string | null;
    username: string;
  }>({ type: null, id: null, username: '' });
  const [previewUserId, setPreviewUserId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<PaginatedResponse<AdminUser>>({
    queryKey: ['admin', 'users', page, debouncedSearch, statusFilter],
    queryFn: () =>
      adminApi
        .getUsers(
          page,
          10,
          debouncedSearch || undefined,
          statusFilter || undefined,
        )
        .then((res) => res.data as PaginatedResponse<AdminUser>),
  });

  const invalidateUsers = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    setConfirmAction({ type: null, id: null, username: '' });
  };

  const banMutation = useMutation({
    mutationFn: (id: string) => adminApi.banUser(id),
    onSuccess: () => {
      invalidateUsers();
      onToast('Usuario baneado', 'success');
    },
    onError: () => onToast('Error al banear usuario', 'error'),
  });

  const unbanMutation = useMutation({
    mutationFn: (id: string) => adminApi.unbanUser(id),
    onSuccess: () => {
      invalidateUsers();
      onToast('Usuario desbaneado', 'success');
    },
    onError: () => onToast('Error al desbanear usuario', 'error'),
  });

  const promoteMutation = useMutation({
    mutationFn: (id: string) => adminApi.promoteUser(id),
    onSuccess: () => {
      invalidateUsers();
      onToast('Usuario promovido a admin', 'success');
    },
    onError: () => onToast('Error al promover usuario', 'error'),
  });

  const demoteMutation = useMutation({
    mutationFn: (id: string) => adminApi.demoteUser(id),
    onSuccess: () => {
      invalidateUsers();
      onToast('Usuario degradado', 'success');
    },
    onError: () => onToast('Error al degradar usuario', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteUser(id),
    onSuccess: () => {
      invalidateUsers();
      onToast('Cuenta eliminada permanentemente', 'success');
    },
    onError: () => onToast('Error al eliminar cuenta', 'error'),
  });

  const isPending =
    banMutation.isPending ||
    unbanMutation.isPending ||
    promoteMutation.isPending ||
    demoteMutation.isPending ||
    deleteMutation.isPending;

  const handleConfirm = () => {
    if (!confirmAction.id) return;
    switch (confirmAction.type) {
      case 'ban':
        banMutation.mutate(confirmAction.id);
        break;
      case 'unban':
        unbanMutation.mutate(confirmAction.id);
        break;
      case 'promote':
        promoteMutation.mutate(confirmAction.id);
        break;
      case 'demote':
        demoteMutation.mutate(confirmAction.id);
        break;
      case 'delete':
        deleteMutation.mutate(confirmAction.id);
        break;
    }
  };

  const handleExport = async () => {
    try {
      const res = await adminApi.exportUsersCSV();
      const blob = new Blob([res.data as BlobPart], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'circlesfera-users.csv';
      a.click();
      URL.revokeObjectURL(url);
      onToast('CSV descargado', 'success');
    } catch {
      onToast('Error al exportar CSV', 'error');
    }
  };

  const confirmConfig = {
    ban: {
      title: '¿Banear a este usuario?',
      message:
        'El usuario no podrá acceder a su cuenta ni interactuar en la plataforma hasta que sea desbaneado.',
      confirmText: 'Banear Usuario',
      destructive: true,
    },
    unban: {
      title: '¿Desbanear a este usuario?',
      message: 'El usuario recuperará el acceso completo a su cuenta.',
      confirmText: 'Desbanear Usuario',
      destructive: false,
    },
    promote: {
      title: '¿Promover a administrador?',
      message: `@${confirmAction.username} tendrá acceso completo al panel de administración.`,
      confirmText: 'Promover',
      destructive: false,
    },
    demote: {
      title: '¿Retirar permisos de admin?',
      message: `@${confirmAction.username} perderá acceso al panel de administración.`,
      confirmText: 'Degradar',
      destructive: true,
    },
    delete: {
      title: '¿Eliminar cuenta permanentemente?',
      message: `ATENCIÓN: Esta acción es IRREVERSIBLE. Se eliminarán TODOS los datos de @${confirmAction.username}: publicaciones, comentarios, likes, mensajes, historias, etc.`,
      confirmText: 'Eliminar Permanentemente',
      destructive: true,
    },
  };

  const activeConfig = confirmAction.type
    ? confirmConfig[confirmAction.type]
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 flex-1 min-w-0">
            <div className="flex-1 min-w-0">
              <SearchInput
                value={search}
                onChange={(v) => {
                  setSearch(v);
                  setPage(1);
                }}
                placeholder="Buscar usuarios..."
              />
            </div>
            <FilterDropdown
              label="Filtrar por estado"
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v);
                setPage(1);
              }}
              options={[
                { value: '', label: 'Todos' },
                { value: 'active', label: 'Activos' },
                { value: 'banned', label: 'Baneados' },
              ]}
            />
          </div>
          <Button
            onClick={handleExport}
            variant="outline"
            className="text-sm font-semibold text-gray-300 hover:text-white border-white/10 px-4 py-2.5 w-full sm:w-auto shrink-0"
            aria-label="Exportar usuarios como CSV"
          >
            <Download size={16} className="mr-2" />
            Exportar CSV
          </Button>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden border border-white/10 bg-black/20 lg:bg-transparent lg:border-0">
        <AdminList
          loading={isLoading}
          isEmpty={!data || data.data.length === 0}
          emptyTitle="No hay usuarios"
          emptyDescription="No se encontraron usuarios con los filtros seleccionados."
          mobile={
            <div className="p-2 space-y-2 lg:p-0">
              {data?.data.map((user) => (
                <AdminListRow
                  key={user.id}
                  title={
                    <span className="inline-flex items-center gap-1">
                      @{user.profile?.username || 'user'}
                      <VerificationBadge
                        level={user.verificationLevel as VerificationLevel}
                        size={14}
                      />
                    </span>
                  }
                  subtitle={user.email}
                  meta={
                    <>
                      <span>
                        {user.role === 'ADMIN' ? 'Admin' : 'User'} ·{' '}
                        {user.postCount} posts
                      </span>
                      <span>
                        {new Date(user.createdAt).toLocaleDateString()}
                      </span>
                    </>
                  }
                  badge={
                    <StatusBadge status={user.isActive ? 'active' : 'banned'} />
                  }
                  avatar={
                    <UserAvatar
                      src={user.profile?.avatar || undefined}
                      thumbnailUrl={user.profile?.thumbnailUrl || undefined}
                      standardUrl={user.profile?.standardUrl || undefined}
                      alt={user.profile?.username || 'user'}
                      size="sm"
                    />
                  }
                  primaryAction={
                    user.isActive ? (
                      <ActionButton
                        onClick={() =>
                          setConfirmAction({
                            type: 'ban',
                            id: user.id,
                            username: user.profile?.username || '',
                          })
                        }
                        label="Banear"
                        variant="danger"
                        icon={Ban}
                        disabled={isPending}
                      />
                    ) : (
                      <ActionButton
                        onClick={() =>
                          setConfirmAction({
                            type: 'unban',
                            id: user.id,
                            username: user.profile?.username || '',
                          })
                        }
                        label="Desbanear"
                        variant="success"
                        icon={Ban}
                        disabled={isPending}
                      />
                    )
                  }
                  secondaryActions={[
                    {
                      label: 'Ver detalle',
                      onClick: () => setPreviewUserId(user.id),
                    },
                    {
                      label:
                        user.role === 'USER' ? 'Promover a admin' : 'Degradar',
                      onClick: () =>
                        setConfirmAction({
                          type: user.role === 'USER' ? 'promote' : 'demote',
                          id: user.id,
                          username: user.profile?.username || '',
                        }),
                    },
                    {
                      label: 'Ver perfil',
                      onClick: () => {
                        window.open(
                          `/${user.profile?.username || ''}`,
                          '_blank',
                        );
                      },
                    },
                    {
                      label: 'Eliminar cuenta',
                      variant: 'danger',
                      onClick: () =>
                        setConfirmAction({
                          type: 'delete',
                          id: user.id,
                          username: user.profile?.username || '',
                        }),
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
                'Email',
                'Rol',
                'Unido el',
                'Posts',
                'Estado',
                'Acciones',
              ]}
              columnWidths={[
                'w-auto',
                'w-auto',
                'w-[8%] whitespace-nowrap',
                'w-[10%] whitespace-nowrap',
                'w-[8%] whitespace-nowrap',
                'w-[10%] whitespace-nowrap',
                'w-[160px] whitespace-nowrap',
              ]}
              loading={false}
              isEmpty={false}
            >
              {data?.data.map((user) => (
                <motion.tr
                  key={user.id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="hover:bg-white/[0.07] even:bg-white/2 transition-colors border-b border-white/5 last:border-0"
                >
                  <td className="px-2 py-2" data-label="Usuario">
                    <div className="flex items-center gap-2">
                      <UserAvatar
                        src={user.profile?.avatar || undefined}
                        thumbnailUrl={user.profile?.thumbnailUrl || undefined}
                        standardUrl={user.profile?.standardUrl || undefined}
                        alt={user.profile?.username || 'user'}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <a
                            href={`/${user.profile?.username || ''}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white font-semibold text-sm hover:text-brand-primary transition-colors"
                          >
                            @{user.profile?.username || 'user'}
                          </a>
                          <VerificationBadge
                            level={user.verificationLevel as VerificationLevel}
                            size={14}
                          />
                        </div>
                        <p className="text-gray-500 text-xs">
                          {user.profile?.fullName || ''}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td
                    className="px-2 py-2 text-gray-300 text-sm"
                    data-label="Email"
                  >
                    {user.email}
                  </td>
                  <td className="px-2 py-2 text-right" data-label="Rol">
                    {user.role === 'ADMIN' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-primary/10 text-brand-primary rounded text-xs font-semibold uppercase border border-brand-primary/20">
                        <ShieldCheck size={10} />
                        Admin
                      </span>
                    ) : (
                      <span className="text-gray-500 text-xs">User</span>
                    )}
                  </td>
                  <td
                    className="px-2 py-2 text-gray-500 text-sm whitespace-nowrap"
                    data-label="Unido el"
                  >
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td
                    className="px-2 py-2 text-gray-300 text-sm font-semibold md:text-center"
                    data-label="Posts"
                  >
                    {user.postCount}
                  </td>
                  <td className="px-2 py-2" data-label="Estado">
                    <StatusBadge status={user.isActive ? 'active' : 'banned'} />
                  </td>
                  <td className="px-2 py-2" data-label="Acciones">
                    <div className="flex gap-1.5 items-center">
                      <ActionButton
                        onClick={() => setPreviewUserId(user.id)}
                        label="Ver Detalle"
                        variant="ghost"
                        icon={Eye}
                        iconOnly
                      />
                      {user.isActive ? (
                        <ActionButton
                          onClick={() =>
                            setConfirmAction({
                              type: 'ban',
                              id: user.id,
                              username: user.profile?.username || '',
                            })
                          }
                          label="Banear"
                          variant="danger"
                          icon={Ban}
                          iconOnly
                          disabled={isPending}
                        />
                      ) : (
                        <ActionButton
                          onClick={() =>
                            setConfirmAction({
                              type: 'unban',
                              id: user.id,
                              username: user.profile?.username || '',
                            })
                          }
                          label="Desbanear"
                          variant="success"
                          icon={Ban}
                          iconOnly
                          disabled={isPending}
                        />
                      )}
                      {user.role === 'USER' ? (
                        <ActionButton
                          onClick={() =>
                            setConfirmAction({
                              type: 'promote',
                              id: user.id,
                              username: user.profile?.username || '',
                            })
                          }
                          label="Promover"
                          variant="warning"
                          icon={ShieldCheck}
                          iconOnly
                          disabled={isPending}
                        />
                      ) : (
                        <ActionButton
                          onClick={() =>
                            setConfirmAction({
                              type: 'demote',
                              id: user.id,
                              username: user.profile?.username || '',
                            })
                          }
                          label="Degradar"
                          variant="ghost"
                          icon={ShieldOff}
                          iconOnly
                          disabled={isPending}
                        />
                      )}
                      <ActionButton
                        onClick={() =>
                          setConfirmAction({
                            type: 'delete',
                            id: user.id,
                            username: user.profile?.username || '',
                          })
                        }
                        label="Eliminar"
                        variant="danger"
                        icon={Trash2}
                        iconOnly
                        disabled={isPending}
                      />
                      <a
                        href={`/${user.profile?.username || ''}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Ver perfil"
                        className="p-2 rounded-lg text-brand-primary bg-brand-primary/10 hover:bg-brand-primary hover:text-white transition-all"
                        aria-label="Ver perfil del usuario"
                      >
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </Table>
          }
        />
        <Pagination meta={data?.meta} onPageChange={setPage} />
      </div>

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={confirmAction.type !== null}
        onClose={() => setConfirmAction({ type: null, id: null, username: '' })}
        onConfirm={handleConfirm}
        title={activeConfig?.title || ''}
        message={activeConfig?.message || ''}
        confirmText={activeConfig?.confirmText || 'Confirmar'}
        cancelText="Cancelar"
        isDestructive={activeConfig?.destructive ?? true}
        isLoading={isPending}
      />

      {/* Preview Modal */}
      <UserPreviewModal
        userId={previewUserId}
        isOpen={!!previewUserId}
        onClose={() => setPreviewUserId(null)}
      />
    </div>
  );
}
