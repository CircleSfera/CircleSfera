import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Ban,
  Download,
  ExternalLink,
  Eye,
  PauseCircle,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserCog,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { AdminUser } from '../../services/admin.service';
import { adminApi, type EnhancedStats } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import { platformOrigin } from '../../utils/adminPanel';
import { UserAvatar } from '../index';
import ConfirmModal from '../modals/ConfirmModal';
import { Button } from '../ui';
import VerificationBadge, {
  type VerificationLevel,
} from '../VerificationBadge';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminKpiWidget } from './AdminKpiWidget';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminSegmentedControl } from './AdminSegmentedControl';
import { AdminListSkeleton } from './AdminSkeletons';
import { AdminSplitView } from './AdminSplitView';
import {
  ActionButton,
  Pagination,
  SearchInput,
  StatusBadge,
} from './AdminTable';
import UserDetailPanel from './UserDetailPanel';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

type ConfirmType =
  | 'ban'
  | 'unban'
  | 'promote'
  | 'demote'
  | 'delete'
  | 'warn'
  | 'suspend'
  | 'restore';

function usernameOf(user: AdminUser) {
  return user.profile?.username || '';
}

function displayHandle(user: AdminUser) {
  return `@${user.profile?.username || 'user'}`;
}

function isSuspended(user: AdminUser) {
  if (!user.suspendedUntil) return false;
  return new Date(user.suspendedUntil).getTime() > Date.now();
}

export default function Dashboard({ onToast }: Props) {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState('ALL');
  const debouncedSearch = useDebouncedValue(search, 400);
  const queryClient = useQueryClient();
  const dateLocale = i18n.language?.startsWith('en') ? 'en-US' : 'es-ES';

  const [confirmAction, setConfirmAction] = useState<{
    type: ConfirmType | null;
    id: string | null;
    username: string;
    days?: number;
    reason?: string;
  }>({ type: null, id: null, username: '' });
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [suspendDraft, setSuspendDraft] = useState<{
    user: AdminUser;
    days: string;
    reason: string;
  } | null>(null);

  useEffect(() => {
    const fromQuery = searchParams.get('userId') || searchParams.get('user');
    if (fromQuery) {
      setSelectedUserId(fromQuery);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('userId');
          next.delete('user');
          return next;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams]);

  const statusFilter = segment === 'BANNED' ? 'banned' : undefined;
  const roleFilter = segment === 'ADMINS' ? 'ADMIN' : undefined;

  const { data: statsData } = useQuery<EnhancedStats>({
    queryKey: ['admin', 'stats', 'enhanced'],
    queryFn: () => adminApi.getEnhancedStats(),
  });

  const { data, isLoading } = useQuery<PaginatedResponse<AdminUser>>({
    queryKey: [
      'admin',
      'users',
      page,
      debouncedSearch,
      statusFilter,
      roleFilter,
    ],
    queryFn: () =>
      adminApi
        .getUsers(
          page,
          10,
          debouncedSearch || undefined,
          statusFilter,
          roleFilter,
        )
        .then((res) => res.data as PaginatedResponse<AdminUser>),
  });

  const clearConfirm = () =>
    setConfirmAction({ type: null, id: null, username: '' });

  const askConfirm = (
    type: ConfirmType,
    user: AdminUser,
    extra?: { days?: number; reason?: string },
  ) => {
    setConfirmAction({
      type,
      id: user.id,
      username: usernameOf(user),
      days: extra?.days,
      reason: extra?.reason,
    });
  };

  const askWarn = (user: AdminUser) => {
    const reason = window.prompt(t('admin.users.prompt_warn_reason'));
    if (reason === null) return;
    askConfirm('warn', user, { reason: reason.trim() || undefined });
  };

  const askSuspend = (user: AdminUser) => {
    setSuspendDraft({ user, days: '7', reason: '' });
  };

  const submitSuspendDraft = () => {
    if (!suspendDraft) return;
    const days = Number.parseInt(suspendDraft.days, 10);
    if (!Number.isFinite(days) || days < 1) {
      onToast(t('admin.users.toast_suspend_days_invalid'), 'error');
      return;
    }
    const { user, reason } = suspendDraft;
    setSuspendDraft(null);
    askConfirm('suspend', user, {
      days,
      reason: reason.trim() || undefined,
    });
  };

  const actionMutation = useMutation({
    mutationFn: async ({
      type,
      id,
      days,
      reason,
    }: {
      type: ConfirmType;
      id: string;
      days?: number;
      reason?: string;
    }) => {
      switch (type) {
        case 'ban':
          return adminApi.banUser(id);
        case 'unban':
          return adminApi.unbanUser(id);
        case 'promote':
          return adminApi.updateUserRole(id, 'ADMIN');
        case 'demote':
          return adminApi.updateUserRole(id, 'USER');
        case 'delete':
          return adminApi.deleteUser(id);
        case 'warn':
          return adminApi.warnUser(id, reason);
        case 'suspend':
          return adminApi.suspendUser(id, days ?? 7, reason);
        case 'restore':
          return adminApi.restoreUser(id);
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
        warn: 'admin.users.toast_warned',
        suspend: 'admin.users.toast_suspended',
        restore: 'admin.users.toast_restored',
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
        warn: 'admin.users.toast_warn_error',
        suspend: 'admin.users.toast_suspend_error',
        restore: 'admin.users.toast_restore_error',
      }[variables.type];
      onToast(t(toastKey), 'error');
    },
  });

  const handleConfirm = () => {
    if (!confirmAction.id || !confirmAction.type) return;
    actionMutation.mutate({
      type: confirmAction.type,
      id: confirmAction.id,
      days: confirmAction.days,
      reason: confirmAction.reason,
    });
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
    warn: {
      title: t('admin.users.confirm_warn_title'),
      message: t('admin.users.confirm_warn_message', {
        username: confirmAction.username,
      }),
      confirmText: t('admin.users.confirm_warn_confirm'),
      destructive: false,
    },
    suspend: {
      title: t('admin.users.confirm_suspend_title'),
      message: t('admin.users.confirm_suspend_message', {
        username: confirmAction.username,
        days: confirmAction.days ?? 7,
      }),
      confirmText: t('admin.users.confirm_suspend_confirm'),
      destructive: true,
    },
    restore: {
      title: t('admin.users.confirm_restore_title'),
      message: t('admin.users.confirm_restore_message', {
        username: confirmAction.username,
      }),
      confirmText: t('admin.users.confirm_restore_confirm'),
      destructive: false,
    },
  };

  const activeConfig = confirmAction.type
    ? confirmConfig[confirmAction.type]
    : null;

  const isPending = actionMutation.isPending;
  const users = data?.data ?? [];

  const openProfile = (user: AdminUser) => {
    const handle = usernameOf(user);
    if (!handle) return;
    // Must open on platform host — admin /:tab would treat username as a tab → analytics
    window.open(
      `${platformOrigin()}/${handle}`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  return (
    <div className="space-y-2.5">
      <AdminPageHeader
        title={t('admin.users.title')}
        subtitle={t('admin.users.subtitle')}
        actions={
          <Button
            onClick={handleExport}
            variant="outline"
            className="text-sm font-semibold text-white/70 hover:text-white border-white/10 px-4 min-h-11 w-full sm:w-auto"
            aria-label={t('admin.users.export_csv_aria')}
          >
            <Download size={16} className="mr-2" />
            {t('admin.users.export_csv')}
          </Button>
        }
      />

      {/* KPI Dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <AdminKpiWidget
          title={t('admin.users.kpi_registered')}
          value={statsData?.users.toLocaleString() || '0'}
          icon={<Users size={16} />}
          trend={{
            value: statsData?.userGrowth || 0,
            label: t('admin.shared.this_month'),
          }}
        />
        <AdminKpiWidget
          title={t('admin.users.kpi_new_week')}
          value={statsData?.newUsersThisWeek.toLocaleString() || '0'}
          icon={<UserCheck size={16} />}
          iconColorClass="text-green-400 bg-green-400/10"
        />
        <AdminKpiWidget
          title={t('admin.users.kpi_active_today')}
          value={statsData?.activeUsersToday.toLocaleString() || '0'}
          icon={<ShieldCheck size={16} />}
          iconColorClass="text-brand-accent bg-brand-accent/10"
        />
        <AdminKpiWidget
          title={t('admin.users.kpi_pending_reports')}
          value={statsData?.pendingReports.toLocaleString() || '0'}
          icon={<Ban size={16} />}
          iconColorClass="text-red-400 bg-red-400/10"
        />
      </div>

      <AdminFilterBar>
        <AdminSegmentedControl
          value={segment}
          onChange={(v) => {
            setSegment(v);
            setPage(1);
          }}
          options={[
            { value: 'ALL', label: t('admin.shared.filter_all_recent') },
            { value: 'BANNED', label: t('admin.users.segment_banned') },
            { value: 'ADMINS', label: t('admin.users.segment_admins') },
          ]}
        />
        <div className="flex-1 min-w-0 md:max-w-xs">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder={t('admin.users.search_placeholder')}
          />
        </div>
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
                    search.length > 0
                      ? t('admin.users.empty_filtered_title')
                      : t('admin.users.empty_title')
                  }
                  description={
                    search.length > 0
                      ? t('admin.users.empty_filtered_description')
                      : t('admin.users.empty_description')
                  }
                  action={
                    search.length > 0 ? (
                      <Button
                        onClick={() => {
                          setSearch('');
                          setPage(1);
                        }}
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
                users.map((user) => {
                  const suspended = isSuspended(user);
                  return (
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
                          {user.suspendedUntil && (
                            <span className="text-amber-400/90">
                              {t('admin.users.suspended_until', {
                                date: new Date(
                                  user.suspendedUntil,
                                ).toLocaleDateString(dateLocale),
                              })}
                            </span>
                          )}
                        </>
                      }
                      badge={
                        <StatusBadge
                          status={
                            suspended
                              ? 'banned'
                              : user.isActive
                                ? 'active'
                                : 'banned'
                          }
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
                          icon: Eye,
                          onClick: () => setSelectedUserId(user.id),
                        },
                        {
                          label: t('admin.users.action_warn'),
                          icon: AlertTriangle,
                          onClick: () => askWarn(user),
                        },
                        {
                          label: t('admin.users.action_suspend'),
                          icon: PauseCircle,
                          onClick: () => askSuspend(user),
                        },
                        ...(suspended || !user.isActive
                          ? [
                              {
                                label: t('admin.users.action_restore'),
                                icon: UserCheck,
                                onClick: () => askConfirm('restore', user),
                              },
                            ]
                          : []),
                        {
                          label:
                            user.role === 'USER'
                              ? t('admin.users.action_promote_admin')
                              : t('admin.users.action_demote'),
                          icon: UserCog,
                          onClick: () =>
                            askConfirm(
                              user.role === 'USER' ? 'promote' : 'demote',
                              user,
                            ),
                        },
                        {
                          label: t('admin.users.action_view_profile'),
                          icon: ExternalLink,
                          onClick: () => openProfile(user),
                        },
                        {
                          label: t('admin.users.action_delete'),
                          icon: Trash2,
                          variant: 'danger' as const,
                          dividerBefore: true,
                          onClick: () => askConfirm('delete', user),
                        },
                      ]}
                    />
                  );
                })
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
        isOpen={suspendDraft !== null}
        onClose={() => setSuspendDraft(null)}
        onConfirm={submitSuspendDraft}
        title={t('admin.users.suspend_form_title')}
        message={t('admin.users.suspend_form_message', {
          username: suspendDraft ? usernameOf(suspendDraft.user) : '',
        })}
        confirmText={t('admin.users.confirm_suspend_confirm')}
        cancelText={t('admin.shared.cancel')}
        isDestructive
      >
        <div className="space-y-3 mt-3">
          <label className="block text-xs text-white/60">
            {t('admin.users.prompt_suspend_days')}
            <input
              type="number"
              min={1}
              value={suspendDraft?.days ?? '7'}
              onChange={(e) =>
                setSuspendDraft((prev) =>
                  prev ? { ...prev, days: e.target.value } : prev,
                )
              }
              className="mt-1 w-full min-h-11 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-white/60">
            {t('admin.users.prompt_suspend_reason')}
            <textarea
              value={suspendDraft?.reason ?? ''}
              onChange={(e) =>
                setSuspendDraft((prev) =>
                  prev ? { ...prev, reason: e.target.value } : prev,
                )
              }
              rows={3}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white resize-y"
            />
          </label>
        </div>
      </ConfirmModal>

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
