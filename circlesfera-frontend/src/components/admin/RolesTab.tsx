import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  KeyRound,
  Plus,
  Shield,
  ShieldCheck,
  ShieldOff,
  UserCog,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import {
  type AdminOperator,
  type AdminOperatorRoleOption,
  adminApi,
} from '../../services/admin.service';
import { adminAuthApi } from '../../services/admin-auth.service';
import type { PaginatedResponse } from '../../types';
import { Button, Input } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminListSkeleton } from './AdminSkeletons';
import { AdminSplitView } from './AdminSplitView';
import { Pagination, SearchInput, StatusBadge } from './AdminTable';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

function isStepUpRequired(err: unknown): boolean {
  const e = err as {
    response?: { status?: number; data?: { message?: string; code?: string } };
  };
  return (
    e?.response?.status === 401 &&
    (e.response.data?.code === 'ADMIN_STEP_UP_REQUIRED' ||
      e.response.data?.message === 'ADMIN_STEP_UP_REQUIRED')
  );
}

export default function RolesTab({ onToast }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 400);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'ACTIVE' | 'DISABLED'
  >('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [stepUpCode, setStepUpCode] = useState('');
  const [pendingAction, setPendingAction] = useState<
    (() => Promise<unknown>) | null
  >(null);

  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    displayName: '',
    roleIds: ['arole_platform'] as string[],
  });
  const [passwordReset, setPasswordReset] = useState('');

  const { data: rolesCatalog } = useQuery({
    queryKey: ['admin', 'operator-roles'],
    queryFn: () => adminApi.getOperatorRoles().then((r) => r.data),
  });

  const { data, isLoading, isError } = useQuery<
    PaginatedResponse<AdminOperator>
  >({
    queryKey: ['admin', 'operators', page, debouncedSearch, statusFilter],
    queryFn: () =>
      adminApi
        .getOperators(
          page,
          15,
          debouncedSearch || undefined,
          statusFilter === 'ALL' ? undefined : statusFilter,
        )
        .then((r) => r.data),
  });

  const selected = useMemo(
    () => data?.data.find((o) => o.id === selectedId) ?? null,
    [data, selectedId],
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'operators'] });

  const runWithStepUp = async (action: () => Promise<unknown>) => {
    try {
      await action();
      setPendingAction(null);
      setStepUpCode('');
    } catch (err) {
      if (isStepUpRequired(err)) {
        setPendingAction(() => action);
        onToast(
          t(
            'admin.operators.step_up_required',
            'Confirm with your authenticator code',
          ),
          'error',
        );
        return;
      }
      throw err;
    }
  };

  const stepUpMutation = useMutation({
    mutationFn: async () => {
      await adminAuthApi.stepUp({ totpCode: stepUpCode.trim() });
      if (pendingAction) await pendingAction();
    },
    onSuccess: () => {
      setPendingAction(null);
      setStepUpCode('');
      void invalidate();
      onToast(t('admin.operators.step_up_ok', 'Verified'), 'success');
    },
    onError: () => {
      onToast(t('admin.operators.step_up_failed', 'Step-up failed'), 'error');
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      runWithStepUp(() =>
        adminApi.createOperator(createForm).then(async (res) => {
          onToast(t('admin.operators.created', 'Operator created'), 'success');
          setShowCreate(false);
          setCreateForm({
            email: '',
            password: '',
            displayName: '',
            roleIds: ['arole_platform'],
          });
          await invalidate();
          setSelectedId(res.data.id);
        }),
      ),
    onError: (err: any) => {
      if (!isStepUpRequired(err)) {
        onToast(
          err?.response?.data?.message ||
            t('admin.operators.create_error', 'Could not create operator'),
          'error',
        );
      }
    },
  });

  const statusMutation = useMutation({
    mutationFn: (next: 'ACTIVE' | 'DISABLED') =>
      runWithStepUp(async () => {
        if (!selectedId) return;
        await adminApi.updateOperatorStatus(selectedId, next);
        onToast(
          next === 'DISABLED'
            ? t('admin.operators.disabled', 'Operator disabled')
            : t('admin.operators.enabled', 'Operator enabled'),
          'success',
        );
        await invalidate();
      }),
    onError: (err: any) => {
      if (!isStepUpRequired(err)) {
        onToast(
          err?.response?.data?.message ||
            t('admin.operators.status_error', 'Could not update status'),
          'error',
        );
      }
    },
  });

  const rolesMutation = useMutation({
    mutationFn: (roleIds: string[]) =>
      runWithStepUp(async () => {
        if (!selectedId) return;
        await adminApi.replaceOperatorRoles(selectedId, roleIds);
        onToast(t('admin.operators.roles_updated', 'Roles updated'), 'success');
        await invalidate();
      }),
    onError: (err: any) => {
      if (!isStepUpRequired(err)) {
        onToast(
          err?.response?.data?.message ||
            t('admin.operators.roles_error', 'Could not update roles'),
          'error',
        );
      }
    },
  });

  const resetMfaMutation = useMutation({
    mutationFn: () =>
      runWithStepUp(async () => {
        if (!selectedId) return;
        await adminApi.resetOperatorMfa(selectedId);
        onToast(t('admin.operators.mfa_reset', 'MFA reset'), 'success');
        await invalidate();
      }),
    onError: (err: any) => {
      if (!isStepUpRequired(err)) {
        onToast(
          err?.response?.data?.message ||
            t('admin.operators.mfa_error', 'Could not reset MFA'),
          'error',
        );
      }
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () =>
      runWithStepUp(async () => {
        if (!selectedId || passwordReset.length < 12) return;
        await adminApi.resetOperatorPassword(selectedId, passwordReset);
        setPasswordReset('');
        onToast(
          t('admin.operators.password_reset', 'Password updated'),
          'success',
        );
        await invalidate();
      }),
    onError: (err: any) => {
      if (!isStepUpRequired(err)) {
        onToast(
          err?.response?.data?.message ||
            t('admin.operators.password_error', 'Could not reset password'),
          'error',
        );
      }
    },
  });

  return (
    <div className="space-y-2.5">
      <AdminPageHeader
        title={t('admin.operators.title', 'Operators')}
        subtitle={t(
          'admin.operators.subtitle',
          'Admin Panel identities, roles and MFA',
        )}
        actions={
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="min-h-11 gap-2"
            onClick={() => setShowCreate(true)}
          >
            <Plus size={16} />
            {t('admin.operators.create', 'New operator')}
          </Button>
        }
      />

      <AdminFilterBar>
        <SearchInput
          value={searchQuery}
          onChange={(v) => {
            setSearchQuery(v);
            setPage(1);
          }}
          placeholder={t('admin.operators.search', 'Search by email or name…')}
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as typeof statusFilter);
            setPage(1);
          }}
          className="input-glass h-11 px-3 rounded-xl text-sm text-white bg-transparent border border-white/10"
          aria-label={t('admin.operators.filter_status', 'Status')}
        >
          <option value="ALL" className="bg-surface-raised">
            {t('admin.operators.status_all', 'All statuses')}
          </option>
          <option value="ACTIVE" className="bg-surface-raised">
            ACTIVE
          </option>
          <option value="DISABLED" className="bg-surface-raised">
            DISABLED
          </option>
        </select>
      </AdminFilterBar>

      {pendingAction && (
        <div className="glass-panel rounded-lg p-2.5 sm:p-3 space-y-2.5">
          <p className="text-sm text-white/70">
            {t(
              'admin.operators.step_up_hint',
              'Enter your authenticator code to confirm this action.',
            )}
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={stepUpCode}
              onChange={(e) =>
                setStepUpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              placeholder="000000"
              className="font-mono tracking-widest text-center"
              maxLength={6}
            />
            <Button
              type="button"
              variant="primary"
              disabled={stepUpCode.length < 6 || stepUpMutation.isPending}
              isLoading={stepUpMutation.isPending}
              onClick={() => stepUpMutation.mutate()}
            >
              {t('admin.operators.confirm', 'Confirm')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setPendingAction(null);
                setStepUpCode('');
              }}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="glass-panel rounded-lg p-2.5 sm:p-3 space-y-2.5">
          <h3 className="text-sm font-bold text-white">
            {t('admin.operators.create', 'New operator')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              type="email"
              placeholder="email"
              value={createForm.email}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, email: e.target.value }))
              }
            />
            <Input
              placeholder={t('admin.operators.display_name', 'Display name')}
              value={createForm.displayName}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, displayName: e.target.value }))
              }
            />
            <Input
              type="password"
              placeholder={t(
                'admin.operators.password_min',
                'Password (min 12)',
              )}
              value={createForm.password}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, password: e.target.value }))
              }
            />
          </div>
          <RoleChecklist
            catalog={rolesCatalog || []}
            selected={createForm.roleIds}
            onChange={(roleIds) => setCreateForm((f) => ({ ...f, roleIds }))}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="primary"
              isLoading={createMutation.isPending}
              disabled={
                !createForm.email ||
                createForm.password.length < 12 ||
                !createForm.displayName ||
                createForm.roleIds.length === 0
              }
              onClick={() => createMutation.mutate()}
            >
              {t('admin.operators.save', 'Create')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowCreate(false)}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
          </div>
        </div>
      )}

      {isError ? (
        <AdminEmptyState
          icon={ShieldOff}
          title={t('admin.operators.load_error', 'Could not load operators')}
        />
      ) : (
        <AdminSplitView
          hasSelection={!!selected}
          onClearSelection={() => setSelectedId(null)}
          onBack={() => setSelectedId(null)}
          list={
            isLoading ? (
              <AdminListSkeleton rows={8} />
            ) : !data?.data.length ? (
              <AdminEmptyState
                icon={UserCog}
                title={t('admin.operators.empty', 'No operators yet')}
                compact
              />
            ) : (
              <div className="space-y-2">
                {data.data.map((op) => (
                  <AdminListRow
                    key={op.id}
                    selected={selectedId === op.id}
                    onClick={() => setSelectedId(op.id)}
                    title={op.displayName}
                    subtitle={op.email}
                    badge={<StatusBadge status={op.status.toLowerCase()} />}
                    meta={
                      <span className="text-[11px] text-white/40 truncate">
                        {op.roles.map((r) => r.name).join(', ')}
                      </span>
                    }
                    avatar={
                      <div className="w-9 h-9 rounded-xl bg-brand-primary/15 border border-brand-primary/25 flex items-center justify-center">
                        <Shield size={16} className="text-brand-primary" />
                      </div>
                    }
                  />
                ))}
                <Pagination meta={data.meta} onPageChange={(p) => setPage(p)} />
              </div>
            )
          }
          detail={
            selected ? (
              <div className="space-y-2.5 sm:space-y-3 p-1">
                <div className="glass-panel rounded-lg p-2.5 sm:p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-white">
                        {selected.displayName}
                      </h3>
                      <p className="text-sm text-white/50">{selected.email}</p>
                    </div>
                    <StatusBadge status={selected.status.toLowerCase()} />
                  </div>
                  <p className="text-xs text-white/40 flex items-center gap-1.5">
                    {selected.totpEnabled ? (
                      <>
                        <ShieldCheck size={14} className="text-emerald-400" />
                        {t('admin.operators.mfa_on', 'MFA enrolled')}
                      </>
                    ) : (
                      <>
                        <ShieldOff size={14} className="text-amber-400" />
                        {t('admin.operators.mfa_off', 'MFA enrollment pending')}
                      </>
                    )}
                  </p>
                </div>

                <div className="glass-panel rounded-lg p-2.5 sm:p-3 space-y-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white/40">
                    {t('admin.operators.roles', 'Roles')}
                  </h4>
                  <RoleChecklist
                    catalog={rolesCatalog || []}
                    selected={selected.roles.map((r) => r.id)}
                    onChange={(roleIds) => rolesMutation.mutate(roleIds)}
                  />
                </div>

                <div className="glass-panel rounded-lg p-2.5 sm:p-3 space-y-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white/40">
                    {t('admin.operators.actions', 'Actions')}
                  </h4>
                  <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="min-h-11"
                      onClick={() =>
                        statusMutation.mutate(
                          selected.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
                        )
                      }
                    >
                      {selected.status === 'ACTIVE'
                        ? t('admin.operators.disable', 'Disable')
                        : t('admin.operators.enable', 'Enable')}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="min-h-11 gap-2"
                      onClick={() => resetMfaMutation.mutate()}
                    >
                      <KeyRound size={14} />
                      {t('admin.operators.reset_mfa', 'Reset MFA')}
                    </Button>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      type="password"
                      placeholder={t(
                        'admin.operators.new_password',
                        'New password (min 12)',
                      )}
                      value={passwordReset}
                      onChange={(e) => setPasswordReset(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      className="min-h-11"
                      disabled={passwordReset.length < 12}
                      onClick={() => resetPasswordMutation.mutate()}
                    >
                      {t('admin.operators.set_password', 'Set password')}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null
          }
        />
      )}
    </div>
  );
}

function RoleChecklist({
  catalog,
  selected,
  onChange,
}: {
  catalog: AdminOperatorRoleOption[];
  selected: string[];
  onChange: (roleIds: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {catalog.map((role) => {
        const active = selected.includes(role.id);
        return (
          <button
            key={role.id}
            type="button"
            title={role.description || role.name}
            onClick={() => {
              const next = active
                ? selected.filter((id) => id !== role.id)
                : [...selected, role.id];
              if (next.length) onChange(next);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              active
                ? 'bg-brand-primary/15 text-white border-brand-primary/30'
                : 'bg-white/5 text-white/50 border-white/10 hover:text-white'
            }`}
          >
            {role.name}
          </button>
        );
      })}
    </div>
  );
}
