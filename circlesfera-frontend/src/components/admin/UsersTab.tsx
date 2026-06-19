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
import { useDebounce } from '../../hooks/useDebounce';
import type { AdminUser } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import { UserAvatar } from '../index';
import ConfirmModal from '../modals/ConfirmModal';
import VerificationBadge, {
  type VerificationLevel,
} from '../VerificationBadge';
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
  const debouncedSearch = useDebounce(search);
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
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Buscar usuarios..."
          />
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
        <button
          type="button"
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-xl text-sm font-bold transition-all border border-white/10"
          aria-label="Exportar usuarios como CSV"
        >
          <Download size={16} />
          Exportar CSV
        </button>
      </div>

      <div className="glass-panel rounded-2xl overflow-clip border border-white/10">
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
          loading={isLoading}
          isEmpty={!data || data.data.length === 0}
        >
          {data?.data.map((user) => (
            <motion.tr
              key={user.id}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="hover:bg-white/[0.07] transition-colors border-b border-white/5 last:border-0"
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <UserAvatar
                    src={user.profile?.avatar || undefined}
                    thumbnailUrl={user.profile?.thumbnailUrl || undefined}
                    standardUrl={user.profile?.standardUrl || undefined}
                    alt={user.profile?.username || 'user'}
                    size="sm"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <a
                        href={`/${user.profile?.username || ''}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white font-bold text-sm hover:text-brand-primary transition-colors"
                      >
                        @{user.profile?.username || 'user'}
                      </a>
                      <VerificationBadge
                        level={user.verificationLevel as VerificationLevel}
                        size={14}
                      />
                    </div>
                    <p className="text-gray-500 text-[10px]">
                      {user.profile?.fullName || ''}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-gray-400 text-sm max-w-[150px] lg:max-w-[200px] xl:max-w-[300px] truncate" title={user.email}>{user.email}</td>
              <td className="px-4 py-3">
                {user.role === 'ADMIN' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-primary/10 text-brand-primary rounded text-[10px] font-black uppercase border border-brand-primary/20">
                    <ShieldCheck size={10} />
                    Admin
                  </span>
                ) : (
                  <span className="text-gray-500 text-xs">User</span>
                )}
              </td>
              <td className="px-4 py-3 text-gray-500 text-sm whitespace-nowrap">
                {new Date(user.createdAt).toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-gray-400 text-sm font-bold text-center">
                {user.postCount}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={user.isActive ? 'active' : 'banned'} />
              </td>
              <td className="px-4 py-3">
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
