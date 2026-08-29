import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Clock,
  Edit2,
  FlaskConical,
  Key,
  Plus,
  Save,
  Trash2,
  User,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type {
  AdminFeatureFlag,
  AdminUser,
  UserExperiment,
} from '../../services/admin.service';
import { adminApi } from '../../services/admin.service';
import type { PaginatedResponse } from '../../types';
import ConfirmModal from '../modals/ConfirmModal';
import { Button, Input, Select, Switch, Textarea } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminListRow } from './AdminList';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminListSkeleton } from './AdminSkeletons';
import { AdminSplitView } from './AdminSplitView';
import { ActionButton, Pagination, SearchInput } from './AdminTable';

const FLAG_KEY_REGEX = /^[a-z][a-z0-9_]{1,79}$/;

type SubTab = 'flags' | 'experiments';

function variantColorClass(variant: string) {
  const v = variant.toLowerCase();
  return v === 'true' || v === 'treatment' || v === 'on'
    ? 'text-green-400'
    : 'text-orange-400';
}

function FlagStatusBadge({
  isEnabled,
  percentage,
}: {
  isEnabled: boolean;
  percentage: number;
}) {
  const { t } = useTranslation();

  if (!isEnabled) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-red-500/10 border border-red-500/20 text-xs font-semibold text-red-400">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
        {t('admin.experiments.status_off')}
      </span>
    );
  }

  if (percentage === 100) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-green-500/10 border border-green-500/20 text-xs font-semibold text-green-400">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
        {t('admin.experiments.status_full_rollout')}
      </span>
    );
  }

  if (percentage === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-xs font-semibold text-yellow-400">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
        {t('admin.experiments.status_no_reach')}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-green-500/10 border border-green-500/20 text-xs font-semibold text-green-400">
      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
      {t('admin.experiments.status_active')} · {percentage}%
    </span>
  );
}

/** Percentage slider + number input combo. */
function PercentageSlider({
  value,
  onChange,
  id,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  id?: string;
  className?: string;
}) {
  const clamp = (v: number) => Math.min(100, Math.max(0, v));

  return (
    <div className={`flex items-center gap-3 ${className || ''}`}>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className="flex-1 h-1.5 rounded-full appearance-none bg-white/10 accent-brand-primary cursor-pointer [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-brand-primary [&::-webkit-slider-thumb]:shadow-md"
        aria-label="Percentage"
      />
      <Input
        id={id}
        type="number"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value) || 0))}
        className="w-20 min-h-11 text-center"
      />
      <span className="text-xs text-white/50 shrink-0">%</span>
    </div>
  );
}

/** Sub-tab pill toggle. */
function SubTabToggle({
  activeTab,
  onTabChange,
}: {
  activeTab: SubTab;
  onTabChange: (tab: SubTab) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/5 w-fit">
      <button
        type="button"
        onClick={() => onTabChange('flags')}
        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
          activeTab === 'flags'
            ? 'bg-white/10 text-white shadow-sm'
            : 'text-white/50 hover:text-white/80 hover:bg-white/3'
        }`}
      >
        <Key size={14} className="inline-block mr-1.5 -mt-0.5" />
        {t('admin.experiments.tab_flags')}
      </button>
      <button
        type="button"
        onClick={() => onTabChange('experiments')}
        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
          activeTab === 'experiments'
            ? 'bg-white/10 text-white shadow-sm'
            : 'text-white/50 hover:text-white/80 hover:bg-white/3'
        }`}
      >
        <FlaskConical size={14} className="inline-block mr-1.5 -mt-0.5" />
        {t('admin.experiments.tab_experiments')}
      </button>
    </div>
  );
}

/** User autocomplete for experiment assignment. */
function UserAutocomplete({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (userId: string, username?: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, 350);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['admin', 'users-autocomplete', debouncedSearch],
    queryFn: () =>
      adminApi.getUsers(1, 8, debouncedSearch).then((res) => res.data),
    enabled: debouncedSearch.length >= 2 && isOpen,
  });

  const users: AdminUser[] =
    (usersData as PaginatedResponse<AdminUser>)?.data ?? [];

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  if (disabled && value) {
    return (
      <Input value={selectedLabel || value} disabled className="opacity-60" />
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={selectedLabel || (value ? value : searchTerm)}
        onChange={(e) => {
          setSearchTerm(e.target.value);
          setSelectedLabel('');
          onChange('');
          setIsOpen(true);
        }}
        onFocus={() => {
          if (searchTerm.length >= 2) setIsOpen(true);
        }}
        placeholder={t('admin.experiments.user_search_placeholder')}
        disabled={disabled}
      />
      {isOpen && debouncedSearch.length >= 2 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl border border-white/10 bg-[rgb(22,22,24)] shadow-2xl max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="p-3 text-xs text-white/50">
              {t('admin.experiments.searching_users')}
            </div>
          ) : users.length === 0 ? (
            <div className="p-3 text-xs text-white/50">
              {t('admin.experiments.no_users_found')}
            </div>
          ) : (
            users.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => {
                  const username = user.profile?.username ?? user.email;
                  onChange(user.id, username);
                  setSelectedLabel(`@${username} (${user.id.slice(0, 8)}…)`);
                  setSearchTerm('');
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 transition-colors min-h-11"
              >
                {user.profile?.avatar ? (
                  <img
                    src={
                      user.profile.thumbnailUrl ??
                      user.profile.standardUrl ??
                      user.profile.avatar
                    }
                    alt=""
                    className="w-8 h-8 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                    <User size={14} className="text-white/50" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    @{user.profile?.username ?? '—'}
                  </p>
                  <p className="text-xs text-white/50 truncate">
                    {user.email} · {user.id.slice(0, 8)}…
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function ExperimentsTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState<SubTab>('flags');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedFlagId, setSelectedFlagId] = useState<string | null>(null);
  const [selectedExperimentId, setSelectedExperimentId] = useState<
    string | null
  >(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteFlagKey, setConfirmDeleteFlagKey] = useState<
    string | null
  >(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<{
    key: string;
    percentage: number;
  } | null>(null);
  const [flagDrafts, setFlagDrafts] = useState<
    Record<string, { isEnabled: boolean; percentage: number }>
  >({});
  const debouncedSearch = useDebouncedValue(search, 400);

  const { data: flags, isLoading: flagsLoading } = useQuery({
    queryKey: ['admin', 'feature-flags'],
    queryFn: () =>
      adminApi.getFeatureFlags().then((res) => res.data as AdminFeatureFlag[]),
  });

  useEffect(() => {
    if (!flags) return;
    setFlagDrafts((prev) => {
      const next = { ...prev };
      for (const flag of flags) {
        if (!next[flag.key]) {
          next[flag.key] = {
            isEnabled: flag.isEnabled,
            percentage: flag.percentage,
          };
        }
      }
      return next;
    });
  }, [flags]);

  const upsertFlagMutation = useMutation({
    mutationFn: ({
      key,
      data,
    }: {
      key: string;
      data: {
        name?: string;
        description?: string;
        isEnabled?: boolean;
        percentage?: number;
      };
    }) => adminApi.upsertFeatureFlag(key, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'feature-flags'] });
      setSelectedFlagId(null);
    },
  });

  const deleteFlagMutation = useMutation({
    mutationFn: (key: string) => adminApi.deleteFeatureFlag(key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'feature-flags'] });
      setSelectedFlagId(null);
    },
  });

  const { data, isLoading } = useQuery<PaginatedResponse<UserExperiment>>({
    queryKey: ['admin', 'experiments', page, debouncedSearch],
    queryFn: () =>
      adminApi
        .getUserExperiments(page, 20, debouncedSearch || undefined)
        .then(
          (res) => res.data as unknown as PaginatedResponse<UserExperiment>,
        ),
  });

  const experiments = data?.data ?? [];
  const editingEntry =
    selectedExperimentId && selectedExperimentId !== 'new'
      ? (experiments.find((entry) => entry.id === selectedExperimentId) ?? null)
      : null;
  const isAssigning = selectedExperimentId === 'new' || !!editingEntry;

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
      setSelectedExperimentId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.removeUserExperiment(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'experiments'] });
      if (selectedExperimentId === id) setSelectedExperimentId(null);
    },
  });

  const handleDelete = (id: string) => {
    setConfirmDeleteId(id);
  };

  const isCreatingFlag = selectedFlagId === 'new';
  const editingFlag =
    selectedFlagId && selectedFlagId !== 'new'
      ? (flags?.find((f) => f.id === selectedFlagId) ?? null)
      : null;

  const handleToggleEnabled = (flagKey: string, newEnabled: boolean) => {
    const flag = flags?.find((f) => f.key === flagKey);
    if (flag?.isEnabled && !newEnabled && flag.percentage > 0) {
      setConfirmDeactivate({ key: flagKey, percentage: flag.percentage });
      return;
    }
    setFlagDrafts((prev) => ({
      ...prev,
      [flagKey]: {
        ...prev[flagKey],
        isEnabled: newEnabled,
      },
    }));
  };

  return (
    <div className="space-y-2.5">
      <SubTabToggle activeTab={subTab} onTabChange={setSubTab} />

      {/* ═══ Feature Flags Section ═══ */}
      {subTab === 'flags' && (
        <div className="space-y-2.5">
          <AdminPageHeader
            title={t('admin.experiments.flags_title')}
            subtitle={t('admin.experiments.flags_subtitle')}
            actions={
              <Button
                onClick={() => setSelectedFlagId('new')}
                className="min-h-11 w-full sm:w-auto"
              >
                <Plus size={16} className="mr-2" />
                {t('admin.experiments.create_flag')}
              </Button>
            }
          />

          <AdminSplitView
            hasSelection={isCreatingFlag || !!editingFlag}
            onBack={() => setSelectedFlagId(null)}
            onClearSelection={() => setSelectedFlagId(null)}
            listTitle={t('admin.experiments.flags_title')}
            list={
              <div className="flex flex-col h-full min-h-0">
                <div className="flex-1 overflow-y-auto space-y-2 pb-2">
                  {flagsLoading ? (
                    <AdminListSkeleton rows={4} />
                  ) : !flags || flags.length === 0 ? (
                    <AdminEmptyState
                      icon={Key}
                      title={t('admin.experiments.flags_empty')}
                      description={t('admin.experiments.flags_subtitle')}
                      action={
                        <Button
                          onClick={() => setSelectedFlagId('new')}
                          className="min-h-11"
                        >
                          <Plus size={16} className="mr-2" />
                          {t('admin.experiments.create_flag')}
                        </Button>
                      }
                      compact
                    />
                  ) : (
                    flags.map((flag) => {
                      const draft = flagDrafts[flag.key] ?? {
                        isEnabled: flag.isEnabled,
                        percentage: flag.percentage,
                      };
                      const isDirty =
                        draft.isEnabled !== flag.isEnabled ||
                        draft.percentage !== flag.percentage;

                      return (
                        <div
                          key={flag.id}
                          className="rounded-xl border border-white/10 bg-white/3 p-4 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white truncate">
                                {flag.name}
                              </p>
                              <p className="text-xs font-mono text-white/40 truncate">
                                {flag.key}
                              </p>
                              {flag.description && (
                                <p className="text-xs text-white/50 mt-1 line-clamp-2">
                                  {flag.description}
                                </p>
                              )}
                            </div>
                            <FlagStatusBadge
                              isEnabled={draft.isEnabled}
                              percentage={draft.percentage}
                            />
                          </div>

                          <div className="flex items-center gap-x-3 gap-y-1 text-xs text-white/40 flex-wrap">
                            <span className="inline-flex items-center gap-1">
                              <Clock size={12} />
                              {t('admin.experiments.created_at')}{' '}
                              {new Date(flag.createdAt).toLocaleDateString()}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Calendar size={12} />
                              {t('admin.experiments.updated_at')}{' '}
                              {new Date(flag.updatedAt).toLocaleDateString()}
                            </span>
                          </div>

                          <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-3">
                              <Switch
                                checked={draft.isEnabled}
                                onChange={(e) =>
                                  handleToggleEnabled(
                                    flag.key,
                                    e.target.checked,
                                  )
                                }
                                label={t('admin.experiments.enabled')}
                              />
                            </div>
                            <PercentageSlider
                              value={draft.percentage}
                              onChange={(v) =>
                                setFlagDrafts((prev) => ({
                                  ...prev,
                                  [flag.key]: {
                                    ...draft,
                                    percentage: v,
                                  },
                                }))
                              }
                            />
                            <div className="flex items-center gap-2 sm:justify-end">
                              <Button
                                onClick={() =>
                                  upsertFlagMutation.mutate({
                                    key: flag.key,
                                    data: {
                                      isEnabled: draft.isEnabled,
                                      percentage: draft.percentage,
                                    },
                                  })
                                }
                                disabled={
                                  !isDirty || upsertFlagMutation.isPending
                                }
                                isLoading={upsertFlagMutation.isPending}
                                variant="secondary"
                                className="min-h-11"
                              >
                                <Save size={16} className="mr-2 shrink-0" />
                                {t('admin.experiments.save_flag')}
                              </Button>
                              <ActionButton
                                icon={Edit2}
                                onClick={() => setSelectedFlagId(flag.id)}
                                label={t('admin.experiments.edit_flag')}
                                variant="ghost"
                              />
                              <ActionButton
                                icon={Trash2}
                                onClick={() =>
                                  setConfirmDeleteFlagKey(flag.key)
                                }
                                label={t('admin.experiments.delete_flag')}
                                variant="ghost"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            }
            detail={
              isCreatingFlag || editingFlag ? (
                <div className="space-y-2.5 sm:space-y-3 px-1">
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      {editingFlag
                        ? t('admin.experiments.edit_flag')
                        : t('admin.experiments.create_flag')}
                    </h3>
                  </div>
                  <FeatureFlagForm
                    key={editingFlag?.id ?? 'new'}
                    initialData={editingFlag ?? undefined}
                    onSubmit={(payload) => {
                      upsertFlagMutation.mutate({
                        key: payload.key,
                        data: payload,
                      });
                    }}
                    onCancel={() => setSelectedFlagId(null)}
                    isSubmitting={upsertFlagMutation.isPending}
                  />
                </div>
              ) : null
            }
          />

          {/* Confirm delete flag modal */}
          <ConfirmModal
            isOpen={confirmDeleteFlagKey !== null}
            onClose={() => setConfirmDeleteFlagKey(null)}
            onConfirm={() => {
              if (confirmDeleteFlagKey) {
                deleteFlagMutation.mutate(confirmDeleteFlagKey);
              }
              setConfirmDeleteFlagKey(null);
            }}
            title={t('admin.experiments.confirm_delete_flag_title')}
            message={t('admin.experiments.confirm_delete_flag_message')}
            confirmText={t('admin.experiments.delete_flag')}
            cancelText={t('admin.shared.cancel')}
            isDestructive={true}
          />

          {/* Confirm deactivate flag modal */}
          <ConfirmModal
            isOpen={confirmDeactivate !== null}
            onClose={() => setConfirmDeactivate(null)}
            onConfirm={() => {
              if (confirmDeactivate) {
                setFlagDrafts((prev) => ({
                  ...prev,
                  [confirmDeactivate.key]: {
                    ...prev[confirmDeactivate.key],
                    isEnabled: false,
                  },
                }));
              }
              setConfirmDeactivate(null);
            }}
            title={t('admin.experiments.confirm_deactivate_title')}
            message={t('admin.experiments.confirm_deactivate_message', {
              percentage: confirmDeactivate?.percentage ?? 0,
            })}
            confirmText={t('admin.experiments.confirm_deactivate')}
            cancelText={t('admin.shared.cancel')}
            isDestructive={true}
          />
        </div>
      )}

      {/* ═══ User Experiments Section ═══ */}
      {subTab === 'experiments' && (
        <div className="space-y-2.5">
          <AdminPageHeader
            title={t('admin.experiments.ab_title')}
            subtitle={t('admin.experiments.ab_subtitle')}
            actions={
              <Button
                onClick={() => setSelectedExperimentId('new')}
                className="min-h-11 w-full sm:w-auto"
              >
                {t('admin.experiments.assign_experiment')}
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
              placeholder={t('admin.experiments.search_placeholder')}
            />
          </AdminFilterBar>

          <AdminSplitView
            hasSelection={isAssigning}
            onBack={() => setSelectedExperimentId(null)}
            onClearSelection={() => setSelectedExperimentId(null)}
            listTitle={t('admin.experiments.ab_title')}
            list={
              <div className="flex flex-col h-full min-h-0">
                <div className="flex-1 overflow-y-auto space-y-2 pb-2">
                  {isLoading ? (
                    <AdminListSkeleton rows={6} />
                  ) : experiments.length === 0 ? (
                    <AdminEmptyState
                      icon={User}
                      title={t('admin.experiments.empty_title')}
                      description={t('admin.experiments.empty_description')}
                      action={
                        <Button
                          onClick={() => setSelectedExperimentId('new')}
                          className="min-h-11"
                        >
                          {t('admin.experiments.assign_experiment')}
                        </Button>
                      }
                      compact
                    />
                  ) : (
                    experiments.map((entry) => (
                      <AdminListRow
                        key={entry.id}
                        onClick={() => setSelectedExperimentId(entry.id)}
                        className={
                          selectedExperimentId === entry.id
                            ? 'border-brand-primary/30 bg-brand-primary/10'
                            : undefined
                        }
                        title={`@${entry.user.profile?.username || t('admin.shared.unknown')}`}
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
                            onClick={() => setSelectedExperimentId(entry.id)}
                            label={t('admin.experiments.action_edit')}
                            variant="ghost"
                          />
                        }
                        secondaryActions={[
                          {
                            label: t('admin.experiments.action_delete'),
                            variant: 'danger',
                            onClick: () => handleDelete(entry.id),
                          },
                        ]}
                      />
                    ))
                  )}
                </div>
                {data && data.meta?.totalPages > 1 && (
                  <div className="shrink-0 pt-2 border-t border-white/5">
                    <Pagination meta={data.meta} onPageChange={setPage} />
                  </div>
                )}
              </div>
            }
            detail={
              isAssigning ? (
                <div className="space-y-2.5 sm:space-y-3 px-1">
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      {editingEntry
                        ? t('admin.experiments.drawer_edit_title')
                        : t('admin.experiments.drawer_assign_title')}
                    </h3>
                  </div>
                  <ExperimentForm
                    key={editingEntry?.id ?? 'new'}
                    initialData={editingEntry}
                    onSubmit={(payload) => assignMutation.mutate(payload)}
                    onCancel={() => setSelectedExperimentId(null)}
                    isSubmitting={assignMutation.isPending}
                  />
                </div>
              ) : null
            }
          />

          <ConfirmModal
            isOpen={confirmDeleteId !== null}
            onClose={() => setConfirmDeleteId(null)}
            onConfirm={() => {
              if (confirmDeleteId) {
                deleteMutation.mutate(confirmDeleteId);
              }
              setConfirmDeleteId(null);
            }}
            title={t('admin.experiments.confirm_delete_title')}
            message={t('admin.experiments.confirm_delete_message')}
            confirmText={t('admin.experiments.confirm_delete')}
            cancelText={t('admin.shared.cancel')}
            isDestructive={true}
          />
        </div>
      )}
    </div>
  );
}

function FeatureFlagForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  initialData?: AdminFeatureFlag;
  onSubmit: (data: {
    key: string;
    name: string;
    description?: string;
    percentage: number;
    isEnabled: boolean;
  }) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const { t } = useTranslation();
  const isEditing = !!initialData;
  const [key, setKey] = useState(initialData?.key ?? '');
  const [name, setName] = useState(initialData?.name ?? '');
  const [description, setDescription] = useState(
    initialData?.description ?? '',
  );
  const [percentage, setPercentage] = useState(initialData?.percentage ?? 0);
  const [isEnabled, setIsEnabled] = useState(initialData?.isEnabled ?? false);

  const keyValid = FLAG_KEY_REGEX.test(key);
  const keyTouched = key.length > 0;

  return (
    <div className="space-y-2.5">
      <div>
        <label
          htmlFor="flagKey"
          className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-2 block"
        >
          {t('admin.experiments.flag_key')}
        </label>
        <Input
          id="flagKey"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={t('admin.experiments.flag_key_placeholder')}
          disabled={isEditing}
        />
        {keyTouched && !keyValid && !isEditing && (
          <p className="text-xs text-red-400 mt-1">
            {t('admin.experiments.key_invalid')}
          </p>
        )}
      </div>
      <div>
        <label
          htmlFor="flagName"
          className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-2 block"
        >
          {t('admin.experiments.flag_name')}
        </label>
        <Input
          id="flagName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('admin.experiments.flag_name_placeholder')}
        />
      </div>
      <div>
        <label
          htmlFor="flagDescription"
          className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-2 block"
        >
          {t('admin.experiments.flag_description')}
        </label>
        <Textarea
          id="flagDescription"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>
      <div>
        <label
          htmlFor="flagPercentage"
          className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-2 block"
        >
          {t('admin.experiments.percentage')}
        </label>
        <PercentageSlider
          id="flagPercentage"
          value={percentage}
          onChange={setPercentage}
        />
      </div>
      <Switch
        checked={isEnabled}
        onChange={(e) => setIsEnabled(e.target.checked)}
        label={t('admin.experiments.enabled')}
      />
      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          onClick={onCancel}
          variant="secondary"
          className="flex-1 min-h-11 font-semibold bg-white/5 border-transparent text-white/70"
        >
          {t('admin.shared.cancel')}
        </Button>
        <Button
          className="flex-1 min-h-11"
          onClick={() =>
            onSubmit({
              key,
              name,
              description: description || undefined,
              percentage,
              isEnabled,
            })
          }
          disabled={!key || !name || (!isEditing && !keyValid) || isSubmitting}
          isLoading={isSubmitting}
        >
          {t('admin.experiments.save_flag')}
        </Button>
      </div>
    </div>
  );
}

function ExperimentForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  initialData: UserExperiment | null;
  onSubmit: (data: {
    userId: string;
    experimentKey: string;
    variant: string;
  }) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const { t } = useTranslation();
  const [userId, setUserId] = useState(initialData?.userId || '');
  const [experimentKey, setExperimentKey] = useState(
    initialData?.experimentKey || '',
  );
  const [variant, setVariant] = useState(initialData?.variant || 'true');

  return (
    <div className="space-y-2.5">
      <div>
        <label
          htmlFor="userId"
          className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-2 block"
        >
          {t('admin.experiments.form_user_id')}
        </label>
        <UserAutocomplete
          value={userId}
          onChange={(id) => setUserId(id)}
          disabled={!!initialData}
        />
      </div>

      <div>
        <label
          htmlFor="experimentKey"
          className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-2 block"
        >
          {t('admin.experiments.form_experiment_key')}
        </label>
        <Input
          id="experimentKey"
          value={experimentKey}
          onChange={(e) => setExperimentKey(e.target.value)}
          placeholder={t('admin.experiments.form_experiment_key_placeholder')}
          disabled={!!initialData}
        />
      </div>

      <div>
        <label
          htmlFor="variant"
          className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-2 block"
        >
          {t('admin.experiments.form_variant')}
        </label>
        <Select
          id="variant"
          value={variant}
          onChange={(e) => setVariant(e.target.value)}
        >
          <option value="true">{t('admin.experiments.variant_true')}</option>
          <option value="false">{t('admin.experiments.variant_false')}</option>
          <option value="treatment">
            {t('admin.experiments.variant_treatment')}
          </option>
          <option value="control">
            {t('admin.experiments.variant_control')}
          </option>
        </Select>
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          onClick={onCancel}
          variant="secondary"
          className="flex-1 min-h-11 font-semibold bg-white/5 border-transparent text-white/70"
        >
          {t('admin.shared.cancel')}
        </Button>
        <Button
          className="flex-1 min-h-11"
          onClick={() => onSubmit({ userId, experimentKey, variant })}
          disabled={!userId || !experimentKey || !variant || isSubmitting}
          isLoading={isSubmitting}
        >
          {isSubmitting
            ? t('admin.experiments.saving')
            : t('admin.experiments.save')}
        </Button>
      </div>
    </div>
  );
}
