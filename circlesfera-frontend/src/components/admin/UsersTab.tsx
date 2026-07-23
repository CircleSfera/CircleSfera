import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Download, UserCheck, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
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
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminListSkeleton } from './AdminSkeletons';
import { AdminSplitView } from './AdminSplitView';
import {
  ActionButton,
  FilterDropdown,
  Pagination,
  SearchInput,
  StatusBadge,
} from './AdminTable';
import UserDetailPanel from './UserDetailPanel';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

type ConfirmType = 'ban' | 'unban' | 'promote' | 'demote' | 'delete';

function usernameOf(user: AdminUser) {
  return user.profile?.username || '';
}

function displayHandle(user: AdminUser) {
  return `@${user.profile?.username || 'user'}`;
}

export default function UsersTab({ onToast }: Props) {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const queryClient = useQueryClient();
  const dateLocale = i18n.language?.startsWith('en') ? 'en-US' : 'es-ES';

  const [confirmAction, setConfirmAction] = useState<{
    type: ConfirmType | null;
    id: string | null;
    username: string;
  }>({ type: null, id: null, username: '' });
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  useEffect(() => {
    const fromQuery = searchParams.get('user');
    if (fromQuery) {
      setSelectedUserId(fromQuery);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('user');
          return next;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams]);

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

  const clearConfirm = () =>
    setConfirmAction({ type: null, id: null, username: '' });

  const askConfirm = (type: ConfirmType, user: AdminUser) => {
    setConfirmAction({
      type,
      id: user.id,
      username: usernameOf(user),
    });
  };

  const actionMutation = useMutation({
    mutationFn: async ({ type, id }: { type: ConfirmType; id: string }) => {
      switch (type) {
        case 'ban':
          return adminApi.banUser(id);
        case 'unban':
          return adminApi.unbanUser(id);
        case 'promote':
          return adminApi.promoteUser(id);
        case 'demote':
          return adminApi.demoteUser(id);
        case 'delete':
          return adminApi.deleteUser(id);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      if (variables.type === 'delete' && selectedUserId === variables.id) {
        setSelectedUserId(null);
      }
      clearConfirm();
      const toastKey = {
        ban: 'admin.users.toast_banned',
        unban: 'admin.users.toast_unbanned',
        promote: 'admin.users.toast_promoted',
        demote: 'admin.users.toast_demoted',
        delete: 'admin.users.toast_deleted',
      }[variables.type];
      onToast(t(toastKey), 'success');
    },
    onError: (_err, variables) => {
      const toastKey = {
        ban: 'admin.users.toast_ban_error',
        unban: 'admin.users.toast_unban_error',
        promote: 'admin.users.toast_promote_error',
        demote: 'admin.users.toast_demote_error',
        delete: 'admin.users.toast_delete_error',
      }[variables.type];
      onToast(t(toastKey), 'error');
    },
  });

  const handleConfirm = () => {
    if (!confirmAction.id || !confirmAction.type) return;
    actionMutation.mutate({ type: confirmAction.type, id: confirmAction.id });
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
      onToast(t('admin.users.toast_csv_exported'), 'success');
    } catch {
      onToast(t('admin.users.toast_csv_error'), 'error');
    }
  };

  const confirmConfig = {
    ban: {
      title: t('admin.users.confirm_ban_title'),
      message: t('admin.users.confirm_ban_message'),
      confirmText: t('admin.users.confirm_ban_confirm'),
      destructive: true,
    },
    unban: {
      title: t('admin.users.confirm_unban_title'),
      message: t('admin.users.confirm_unban_message'),
      confirmText: t('admin.users.confirm_unban_confirm'),
      destructive: false,
    },
    promote: {
      title: t('admin.users.confirm_promote_title'),
      message: t('admin.users.confirm_promote_message', {
        username: confirmAction.username,
      }),
      confirmText: t('admin.users.confirm_promote_confirm'),
      destructive: false,
    },
    demote: {
      title: t('admin.users.confirm_demote_title'),
      message: t('admin.users.confirm_demote_message', {
        username: confirmAction.username,
      }),
      confirmText: t('admin.users.confirm_demote_confirm'),
      destructive: true,
    },
    delete: {
      title: t('admin.users.confirm_delete_title'),
      message: t('admin.users.confirm_delete_message', {
        username: confirmAction.username,
      }),
      confirmText: t('admin.users.confirm_delete_confirm'),
      destructive: true,
    },
  };

  const activeConfig = confirmAction.type
    ? confirmConfig[confirmAction.type]
    : null;

  const isFiltered = debouncedSearch.length > 0 || statusFilter.length > 0;
  const isPending = actionMutation.isPending;
  const users = data?.data ?? [];

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setPage(1);
  };

  const openProfile = (user: AdminUser) => {
    const handle = usernameOf(user);
    if (!handle) return;
    window.open(`/${handle}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t('admin.users.title')}
        subtitle={t('admin.users.subtitle')}
        actions={
          <Button
            onClick={handleExport}
            variant="outline"
            className="text-sm font-semibold text-gray-300 hover:text-white border-white/10 px-4 min-h-11 w-full sm:w-auto"
            aria-label={t('admin.users.export_csv_aria')}
          >
            <Download size={16} className="mr-2" />
            {t('admin.users.export_csv')}
          </Button>
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
            placeholder={t('admin.users.search_placeholder')}
          />
        </div>
        <FilterDropdown
          label={t('admin.users.filter_status')}
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
          options={[
            { value: '', label: t('admin.users.status_all') },
            { value: 'active', label: t('admin.users.status_active') },
            { value: 'banned', label: t('admin.users.status_banned') },
          ]}
        />
      </AdminFilterBar>

      <AdminSplitView
        hasSelection={!!selectedUserId}
        onBack={() => setSelectedUserId(null)}
        onClearSelection={() => setSelectedUserId(null)}
        listTitle={t('admin.users.title')}
        list={
          <div className="flex flex-col h-full min-h-0">
            <div className="flex-1 overflow-y-auto space-y-2 pb-2">
              {isLoading ? (
                <AdminListSkeleton rows={6} />
              ) : users.length === 0 ? (
                <AdminEmptyState
                  icon={Users}
                  title={
                    isFiltered
                      ? t('admin.users.empty_filtered_title')
                      : t('admin.users.empty_title')
                  }
                  description={
                    isFiltered
                      ? t('admin.users.empty_filtered_description')
                      : t('admin.users.empty_description')
                  }
                  action={
                    isFiltered ? (
                      <Button
                        onClick={clearFilters}
                        variant="secondary"
                        className="min-h-11"
                      >
                        {t('admin.shared.clear_filters')}
                      </Button>
                    ) : undefined
                  }
                  compact
                />
              ) : (
                users.map((user) => (
                  <AdminListRow
                    key={user.id}
                    onClick={() => setSelectedUserId(user.id)}
                    className={
                      selectedUserId === user.id
                        ? 'border-brand-primary/30 bg-brand-primary/10'
                        : undefined
                    }
                    title={
                      <span className="inline-flex items-center gap-1">
                        {displayHandle(user)}
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
                          {user.role === 'ADMIN'
                            ? t('admin.users.role_admin')
                            : t('admin.users.role_user')}{' '}
                          ·{' '}
                          {t('admin.users.posts_count', {
                            count: user.postCount,
                          })}
                        </span>
                        <span>
                          {new Date(user.createdAt).toLocaleDateString(
                            dateLocale,
                          )}
                        </span>
                      </>
                    }
                    badge={
                      <StatusBadge
                        status={user.isActive ? 'active' : 'banned'}
                      />
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
                          onClick={() => askConfirm('ban', user)}
                          label={t('admin.users.action_ban')}
                          variant="danger"
                          icon={Ban}
                          disabled={isPending}
                        />
                      ) : (
                        <ActionButton
                          onClick={() => askConfirm('unban', user)}
                          label={t('admin.users.action_unban')}
                          variant="success"
                          icon={UserCheck}
                          disabled={isPending}
                        />
                      )
                    }
                    secondaryActions={[
                      {
                        label: t('admin.users.action_view_detail'),
                        onClick: () => setSelectedUserId(user.id),
                      },
                      {
                        label:
                          user.role === 'USER'
                            ? t('admin.users.action_promote_admin')
                            : t('admin.users.action_demote'),
                        onClick: () =>
                          askConfirm(
                            user.role === 'USER' ? 'promote' : 'demote',
                            user,
                          ),
                      },
                      {
                        label: t('admin.users.action_view_profile'),
                        onClick: () => openProfile(user),
                      },
                      {
                        label: t('admin.users.action_delete'),
                        variant: 'danger',
                        onClick: () => askConfirm('delete', user),
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
          selectedUserId ? <UserDetailPanel userId={selectedUserId} /> : null
        }
      />

      <ConfirmModal
        isOpen={confirmAction.type !== null}
        onClose={clearConfirm}
        onConfirm={handleConfirm}
        title={activeConfig?.title || ''}
        message={activeConfig?.message || ''}
        confirmText={activeConfig?.confirmText || t('admin.shared.confirm')}
        cancelText={t('admin.shared.cancel')}
        isDestructive={activeConfig?.destructive ?? true}
        isLoading={isPending}
      />
    </div>
  );
}
