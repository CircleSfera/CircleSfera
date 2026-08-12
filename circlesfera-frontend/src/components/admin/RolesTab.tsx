import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DollarSign,
  LifeBuoy,
  Shield,
  ShieldAlert,
  User,
  UserPlus,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AdminUser } from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import { UserAvatar } from '../index';
import PromoteUserModal from '../modals/PromoteUserModal';
import { Button } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminListSkeleton } from './AdminSkeletons';
import { AdminSplitView } from './AdminSplitView';
import { Pagination, SearchInput } from './AdminTable';
import UserDetailPanel from './UserDetailPanel';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

const ROLE_ICONS: Record<string, React.ElementType> = {
  ADMIN: Shield,
  MODERATOR: ShieldAlert,
  SUPPORT: LifeBuoy,
  FINANCE: DollarSign,
  USER: User,
};

function displayHandle(user: AdminUser) {
  return `@${user.profile?.username || 'user'}`;
}

export default function RolesTab({ onToast }: Props) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const debouncedSearch = useDebouncedValue(searchQuery, 400);

  const page = Number(searchParams.get('page')) || 1;
  const limit = 15;

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isPromoteModalOpen, setIsPromoteModalOpen] = useState(false);

  // We fetch only staff members by passing 'ADMIN,MODERATOR,SUPPORT,FINANCE'
  const { data, isLoading } = useQuery<PaginatedResponse<AdminUser>>({
    queryKey: ['admin', 'users', 'staff', page, debouncedSearch],
    queryFn: () =>
      adminApi
        .getUsers(
          page,
          limit,
          debouncedSearch,
          undefined,
          'ADMIN,MODERATOR,SUPPORT,FINANCE',
        )
        .then((res) => res.data),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      adminApi.updateUserRole(id, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      onToast(
        t('admin.users.toast_role_updated', 'Role updated successfully'),
        'success',
      );
    },
    onError: () => {
      onToast(
        t('admin.users.toast_role_error', 'Error updating role'),
        'error',
      );
    },
  });

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const prevQ = prev.get('q') || '';
        if (prevQ !== debouncedSearch) {
          if (debouncedSearch) prev.set('q', debouncedSearch);
          else prev.delete('q');
          prev.set('page', '1');
          return prev;
        }
        return prev;
      },
      { replace: true },
    );
  }, [debouncedSearch, setSearchParams]);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
  };

  const selectedUser =
    selectedUserId && data
      ? data.data.find((u: AdminUser) => u.id === selectedUserId)
      : null;

  return (
    <>
      <AdminSplitView
        hasSelection={!!selectedUser}
        onClearSelection={() => setSelectedUserId(null)}
        detail={
          selectedUser ? <UserDetailPanel userId={selectedUser.id} /> : null
        }
        list={
          <div className="space-y-4">
            <AdminPageHeader
              title={t('admin.roles.title', 'Roles y Permisos')}
              subtitle={t(
                'admin.roles.description',
                'Gestiona los miembros del equipo y sus niveles de acceso.',
              )}
              actions={
                <Button
                  onClick={() => setIsPromoteModalOpen(true)}
                  className="gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  Promover Usuario
                </Button>
              }
            />

            <AdminFilterBar>
              <SearchInput
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder={t('admin.roles.search_placeholder')}
              />
            </AdminFilterBar>

            <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              {isLoading ? (
                <AdminListSkeleton rows={10} />
              ) : data?.data.length === 0 ? (
                <AdminEmptyState
                  icon={Shield}
                  title={t('admin.roles.empty', 'No se encontraron miembros')}
                  description={t(
                    'admin.roles.empty_desc',
                    'Intenta ajustar los filtros de búsqueda.',
                  )}
                />
              ) : (
                <div className="divide-y divide-white/10">
                  {data?.data.map((user: AdminUser) => {
                    const RoleIcon = ROLE_ICONS[user.role] || User;
                    return (
                      <AdminListRow
                        key={user.id}
                        onClick={() => setSelectedUserId(user.id)}
                        className="hover:bg-white/5 transition-colors cursor-pointer"
                        title={user.profile?.fullName || user.email}
                        subtitle={displayHandle(user)}
                        avatar={
                          <UserAvatar
                            src={user.profile?.avatar}
                            alt={user.profile?.fullName || ''}
                            size="md"
                          />
                        }
                        badge={
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-[10px] uppercase font-bold tracking-wider">
                            <RoleIcon size={12} />
                            {user.role}
                          </div>
                        }
                        meta={new Date(user.createdAt).toLocaleDateString()}
                        primaryAction={
                          <div className="flex items-center gap-2">
                            {user.role !== 'ADMIN' && (
                              <select
                                onClick={(e) => e.stopPropagation()}
                                value={user.role}
                                onChange={(e) => {
                                  updateRoleMutation.mutate({
                                    id: user.id,
                                    role: e.target.value,
                                  });
                                }}
                                className="bg-white/5 border border-white/10 rounded-lg py-1.5 px-2 text-xs text-white focus:outline-none focus:border-brand-primary cursor-pointer"
                              >
                                <option
                                  value="MODERATOR"
                                  className="bg-[#0F1014] text-white"
                                >
                                  MODERATOR
                                </option>
                                <option
                                  value="SUPPORT"
                                  className="bg-[#0F1014] text-white"
                                >
                                  SUPPORT
                                </option>
                                <option
                                  value="FINANCE"
                                  className="bg-[#0F1014] text-white"
                                >
                                  FINANCE
                                </option>
                                <option
                                  value="USER"
                                  className="bg-[#0F1014] text-white"
                                >
                                  Revocar (USER)
                                </option>
                              </select>
                            )}
                          </div>
                        }
                      />
                    );
                  })}
                </div>
              )}

              {data?.meta?.totalPages && data.meta.totalPages > 1 && (
                <Pagination
                  meta={data.meta}
                  onPageChange={(p) =>
                    setSearchParams((prev) => {
                      prev.set('page', String(p));
                      return prev;
                    })
                  }
                />
              )}
            </div>
          </div>
        }
      />
      <PromoteUserModal
        isOpen={isPromoteModalOpen}
        onClose={() => setIsPromoteModalOpen(false)}
        isLoading={updateRoleMutation.isPending}
        onConfirm={(userId, role) => {
          updateRoleMutation.mutate({ id: userId, role });
          setIsPromoteModalOpen(false);
        }}
      />
    </>
  );
}
