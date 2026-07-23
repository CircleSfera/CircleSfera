import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Edit2, Key, Plus, Save, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type {
  AdminFeatureFlag,
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

function variantColorClass(variant: string) {
  const v = variant.toLowerCase();
  return v === 'true' || v === 'treatment' || v === 'on'
    ? 'text-green-400'
    : 'text-orange-400';
}

export default function ExperimentsTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedFlagId, setSelectedFlagId] = useState<string | null>(null);
  const [selectedExperimentId, setSelectedExperimentId] = useState<
    string | null
  >(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
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

  return (
    <div className="space-y-6">
      {/* Feature Flags Section */}
      <div className="space-y-4">
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
          hasSelection={isCreatingFlag}
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
                        className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">
                            {flag.name}
                          </p>
                          <p className="text-xs font-mono text-gray-500 truncate">
                            {flag.key}
                          </p>
                          {flag.description && (
                            <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                              {flag.description}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                          <Switch
                            checked={draft.isEnabled}
                            onChange={(e) =>
                              setFlagDrafts((prev) => ({
                                ...prev,
                                [flag.key]: {
                                  ...draft,
                                  isEnabled: e.target.checked,
                                },
                              }))
                            }
                            label={t('admin.experiments.enabled')}
                          />
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={draft.percentage}
                              onChange={(e) =>
                                setFlagDrafts((prev) => ({
                                  ...prev,
                                  [flag.key]: {
                                    ...draft,
                                    percentage: Math.min(
                                      100,
                                      Math.max(0, Number(e.target.value) || 0),
                                    ),
                                  },
                                }))
                              }
                              className="w-20 min-h-11 text-center"
                              aria-label={t('admin.experiments.percentage')}
                            />
                            <span className="text-xs text-gray-400">%</span>
                          </div>
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
                            disabled={!isDirty || upsertFlagMutation.isPending}
                            isLoading={upsertFlagMutation.isPending}
                            variant="secondary"
                            className="min-h-11"
                          >
                            <Save size={16} className="mr-2 shrink-0" />
                            {t('admin.experiments.save_flag')}
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          }
          detail={
            isCreatingFlag ? (
              <div className="space-y-4 px-1">
                <div>
                  <h3 className="text-base font-semibold text-white">
                    {t('admin.experiments.create_flag')}
                  </h3>
                </div>
                <FeatureFlagForm
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
      </div>

      {/* User Experiments Section */}
      <div className="space-y-4">
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
              <div className="space-y-4 px-1">
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
    </div>
  );
}

function FeatureFlagForm({
  onSubmit,
  onCancel,
  isSubmitting,
}: {
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
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [percentage, setPercentage] = useState(0);
  const [isEnabled, setIsEnabled] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="flagKey"
          className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2 block"
        >
          {t('admin.experiments.flag_key')}
        </label>
        <Input
          id="flagKey"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={t('admin.experiments.flag_key_placeholder')}
        />
      </div>
      <div>
        <label
          htmlFor="flagName"
          className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2 block"
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
          className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2 block"
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
      <div className="flex items-center gap-4">
        <label
          htmlFor="flagPercentage"
          className="text-xs font-semibold text-gray-300 uppercase tracking-wider shrink-0"
        >
          {t('admin.experiments.percentage')}
        </label>
        <Input
          id="flagPercentage"
          type="number"
          min={0}
          max={100}
          value={percentage}
          onChange={(e) =>
            setPercentage(
              Math.min(100, Math.max(0, Number(e.target.value) || 0)),
            )
          }
          className="w-24"
        />
        <span className="text-xs text-gray-400">%</span>
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
          className="flex-1 min-h-11 font-semibold bg-white/5 border-transparent text-gray-300"
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
          disabled={!key || !name || isSubmitting}
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
    <div className="space-y-4">
      <div>
        <label
          htmlFor="userId"
          className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2 block"
        >
          {t('admin.experiments.form_user_id')}
        </label>
        <Input
          id="userId"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder={t('admin.experiments.form_user_id_placeholder')}
          disabled={!!initialData}
        />
      </div>

      <div>
        <label
          htmlFor="experimentKey"
          className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2 block"
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
          className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2 block"
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
          className="flex-1 min-h-11 font-semibold bg-white/5 border-transparent text-gray-300"
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
