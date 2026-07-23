import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  Download,
  ExternalLink,
  Eye,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { AdminFilterBar } from './AdminFilterBar';
import { AdminList, AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
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

type ConfirmType = 'ban' | 'unban' | 'promote' | 'demote' | 'delete';

function usernameOf(user: AdminUser) {
  return user.profile?.username || '';
}

function displayHandle(user: AdminUser) {
  return `@${user.profile?.username || 'user'}`;
}

export default function UsersTab({ onToast }: Props) {
  const { t, i18n } = useTranslation();
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
      if (variables.type === 'delete' && previewUserId === variables.id) {
        setPreviewUserId(null);
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

      <div className="rounded-xl border border-white/10 bg-black/20 lg:bg-transparent lg:border-0 overflow-hidden">
        <AdminList
          loading={isLoading}
          isEmpty={!data || data.data.length === 0}
          emptyIcon={Users}
          emptyTitle={
            isFiltered
              ? t('admin.users.empty_filtered_title')
              : t('admin.users.empty_title')
          }
          emptyDescription={
            isFiltered
              ? t('admin.users.empty_filtered_description')
              : t('admin.users.empty_description')
          }
          emptyAction={
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
          mobile={
            <div className="p-2 space-y-2 lg:p-0">
              {data?.data.map((user) => (
                <AdminListRow
                  key={user.id}
                  onClick={() => setPreviewUserId(user.id)}
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
                      onClick: () => setPreviewUserId(user.id),
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
              ))}
            </div>
          }
          desktop={
            <div className="overflow-x-auto">
              <Table
                headers={[
                  t('admin.users.col_user'),
                  t('admin.users.col_email'),
                  t('admin.users.col_role'),
                  t('admin.users.col_joined'),
                  t('admin.users.col_posts'),
                  t('admin.users.col_status'),
                  t('admin.users.col_actions'),
                ]}
                columnWidths={[
                  'min-w-[12rem]',
                  'hidden xl:table-cell min-w-[10rem]',
                  'w-[7rem]',
                  'hidden lg:table-cell w-[7rem]',
                  'w-[4.5rem]',
                  'w-[6rem]',
                  'min-w-[11rem]',
                ]}
                loading={false}
                isEmpty={false}
              >
                {data?.data.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-white/[0.07] even:bg-white/[0.02] transition-colors border-b border-white/5 last:border-0"
                  >
                    <td
                      className="px-2 py-2"
                      data-label={t('admin.users.col_user')}
                    >
                      <button
                        type="button"
                        onClick={() => setPreviewUserId(user.id)}
                        className="flex items-center gap-2 text-left w-full min-w-0 group"
                      >
                        <UserAvatar
                          src={user.profile?.avatar || undefined}
                          thumbnailUrl={user.profile?.thumbnailUrl || undefined}
                          standardUrl={user.profile?.standardUrl || undefined}
                          alt={user.profile?.username || 'user'}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <span className="text-white font-semibold text-sm group-hover:text-brand-primary transition-colors truncate">
                              {displayHandle(user)}
                            </span>
                            <VerificationBadge
                              level={
                                user.verificationLevel as VerificationLevel
                              }
                              size={14}
                            />
                          </div>
                          {user.profile?.fullName && (
                            <p className="text-gray-500 text-xs truncate">
                              {user.profile.fullName}
                            </p>
                          )}
                        </div>
                      </button>
                    </td>
                    <td
                      className="px-2 py-2 text-gray-300 text-sm hidden xl:table-cell max-w-[12rem]"
                      data-label={t('admin.users.col_email')}
                    >
                      <span className="block truncate" title={user.email}>
                        {user.email}
                      </span>
                    </td>
                    <td
                      className="px-2 py-2"
                      data-label={t('admin.users.col_role')}
                    >
                      {user.role === 'ADMIN' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-primary/10 text-brand-primary rounded text-xs font-semibold uppercase border border-brand-primary/20">
                          <ShieldCheck size={10} />
                          {t('admin.users.role_admin')}
                        </span>
                      ) : (
                        <span className="text-gray-500 text-xs">
                          {t('admin.users.role_user')}
                        </span>
                      )}
                    </td>
                    <td
                      className="px-2 py-2 text-gray-500 text-sm hidden lg:table-cell"
                      data-label={t('admin.users.col_joined')}
                    >
                      {new Date(user.createdAt).toLocaleDateString(dateLocale)}
                    </td>
                    <td
                      className="px-2 py-2 text-gray-300 text-sm font-semibold text-center"
                      data-label={t('admin.users.col_posts')}
                    >
                      {user.postCount}
                    </td>
                    <td
                      className="px-2 py-2"
                      data-label={t('admin.users.col_status')}
                    >
                      <StatusBadge
                        status={user.isActive ? 'active' : 'banned'}
                      />
                    </td>
                    <td
                      className="px-2 py-2"
                      data-label={t('admin.users.col_actions')}
                    >
                      <div className="flex gap-1 items-center justify-end">
                        <ActionButton
                          onClick={() => setPreviewUserId(user.id)}
                          label={t('admin.users.action_view_detail')}
                          variant="ghost"
                          icon={Eye}
                          iconOnly
                        />
                        {user.isActive ? (
                          <ActionButton
                            onClick={() => askConfirm('ban', user)}
                            label={t('admin.users.action_ban')}
                            variant="danger"
                            icon={Ban}
                            iconOnly
                            disabled={isPending}
                          />
                        ) : (
                          <ActionButton
                            onClick={() => askConfirm('unban', user)}
                            label={t('admin.users.action_unban')}
                            variant="success"
                            icon={UserCheck}
                            iconOnly
                            disabled={isPending}
                          />
                        )}
                        {user.role === 'USER' ? (
                          <ActionButton
                            onClick={() => askConfirm('promote', user)}
                            label={t('admin.users.action_promote')}
                            variant="warning"
                            icon={ShieldCheck}
                            iconOnly
                            disabled={isPending}
                          />
                        ) : (
                          <ActionButton
                            onClick={() => askConfirm('demote', user)}
                            label={t('admin.users.action_demote')}
                            variant="ghost"
                            icon={ShieldOff}
                            iconOnly
                            disabled={isPending}
                          />
                        )}
                        <ActionButton
                          onClick={() => askConfirm('delete', user)}
                          label={t('admin.users.action_delete')}
                          variant="danger"
                          icon={Trash2}
                          iconOnly
                          disabled={isPending}
                        />
                        <a
                          href={
                            usernameOf(user)
                              ? `/${usernameOf(user)}`
                              : undefined
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          title={t('admin.users.action_view_profile')}
                          className="inline-flex items-center justify-center w-11 h-11 sm:w-9 sm:h-9 rounded-lg text-brand-primary bg-brand-primary/10 hover:bg-brand-primary hover:text-white transition-all shrink-0"
                          aria-label={t('admin.users.action_view_profile')}
                          onClick={(e) => {
                            if (!usernameOf(user)) e.preventDefault();
                          }}
                        >
                          <ExternalLink size={14} />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            </div>
          }
        />
        <Pagination meta={data?.meta} onPageChange={setPage} />
      </div>

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

      <UserPreviewModal
        userId={previewUserId}
        isOpen={!!previewUserId}
        onClose={() => setPreviewUserId(null)}
      />
    </div>
  );
}
