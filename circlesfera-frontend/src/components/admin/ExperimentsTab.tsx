import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Edit2, Key, Plus, Save, Trash2, User } from 'lucide-react';
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
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [isCreatingFlag, setIsCreatingFlag] = useState(false);
  const [editingEntry, setEditingEntry] = useState<UserExperiment | null>(null);
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
    setConfirmDeleteId(id);
  };

  return (
    <div className="space-y-6">
      {/* Feature Flags Section */}
      <div className="space-y-4">
        <AdminPageHeader
          title={t('admin.experiments.flags_title')}
          subtitle={t('admin.experiments.flags_subtitle')}
          actions={
            <Button
              onClick={() => setIsCreatingFlag(true)}
              className="min-h-11 w-full sm:w-auto"
            >
              <Plus size={16} className="mr-2" />
              {t('admin.experiments.create_flag')}
            </Button>
          }
        />

        <div className="rounded-xl border border-white/10 overflow-hidden">
          {flagsLoading ? (
            <div className="p-6 text-sm text-gray-400 animate-pulse">
              {t('admin.table.loading')}
            </div>
          ) : !flags || flags.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500">
              {t('admin.experiments.flags_empty')}
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {flags.map((flag) => {
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
                    className="p-4 flex flex-col sm:flex-row sm:items-center gap-4"
                  >
                    <div className="flex-1 min-w-0">
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
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
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
              })}
            </div>
          )}
        </div>
      </div>

      {/* User Experiments Section */}
      <div className="space-y-4">
        <AdminPageHeader
          title={t('admin.experiments.ab_title')}
          subtitle={t('admin.experiments.ab_subtitle')}
          actions={
            <Button
              onClick={() => setIsAssigning(true)}
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

        <div className="rounded-xl border border-white/10 overflow-x-auto">
          <AdminList
            loading={isLoading}
            isEmpty={!data || data.data.length === 0}
            emptyTitle={t('admin.experiments.empty_title')}
            emptyDescription={t('admin.experiments.empty_description')}
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
                ))}
              </div>
            }
            desktop={
              <Table
                headers={[
                  t('admin.experiments.col_user'),
                  t('admin.experiments.col_experiment'),
                  t('admin.experiments.col_variant'),
                  t('admin.experiments.col_date'),
                  t('admin.experiments.col_actions'),
                ]}
                columnWidths={[
                  'min-w-32',
                  'min-w-40 max-w-xs',
                  'whitespace-nowrap',
                  'whitespace-nowrap',
                  'whitespace-nowrap',
                ]}
                loading={false}
                isEmpty={false}
              >
                {data?.data.map((entry) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-white/[0.07] transition-colors border-b border-white/5 last:border-0"
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2 text-white font-semibold text-xs min-w-0">
                        <User size={14} className="text-gray-500 shrink-0" />
                        <span className="truncate">@{entry.user.username}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 max-w-xs">
                      <div className="flex items-center gap-2 text-white font-semibold text-xs uppercase tracking-wide min-w-0">
                        <Key size={14} className="text-gray-500 shrink-0" />
                        <span className="truncate" title={entry.experimentKey}>
                          {entry.experimentKey}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs font-semibold whitespace-nowrap">
                      <span
                        className={`px-2 py-1 rounded-md bg-white/5 border border-white/10 ${variantColorClass(entry.variant)}`}
                      >
                        {entry.variant}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Calendar size={13} className="text-gray-500" />
                        {new Date(entry.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <ActionButton
                          icon={Edit2}
                          onClick={() => {
                            setEditingEntry(entry);
                            setIsAssigning(true);
                          }}
                          label={t('admin.experiments.action_edit_variant')}
                          variant="ghost"
                          iconOnly
                        />
                        <ActionButton
                          icon={Trash2}
                          onClick={() => handleDelete(entry.id)}
                          variant="danger"
                          label={t('admin.experiments.action_delete')}
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
            <div className="p-2 border-t border-white/5">
              <Pagination meta={data.meta} onPageChange={setPage} />
            </div>
          )}
        </div>

        <AdminDrawer
          isOpen={isAssigning}
          onClose={() => {
            setIsAssigning(false);
            setEditingEntry(null);
          }}
          title={
            editingEntry
              ? t('admin.experiments.drawer_edit_title')
              : t('admin.experiments.drawer_assign_title')
          }
        >
          <ExperimentForm
            initialData={editingEntry}
            onSubmit={(payload) => assignMutation.mutate(payload)}
            isSubmitting={assignMutation.isPending}
          />
        </AdminDrawer>

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

        <AdminDrawer
          isOpen={isCreatingFlag}
          onClose={() => setIsCreatingFlag(false)}
          title={t('admin.experiments.create_flag')}
        >
          <FeatureFlagForm
            onSubmit={(payload) => {
              upsertFlagMutation.mutate(
                { key: payload.key, data: payload },
                {
                  onSuccess: () => setIsCreatingFlag(false),
                },
              );
            }}
            isSubmitting={upsertFlagMutation.isPending}
          />
        </AdminDrawer>
      </div>
    </div>
  );
}

function FeatureFlagForm({
  onSubmit,
  isSubmitting,
}: {
  onSubmit: (data: {
    key: string;
    name: string;
    description?: string;
    percentage: number;
    isEnabled: boolean;
  }) => void;
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
      <Button
        className="w-full mt-4 min-h-11"
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

      <Button
        className="w-full mt-4 min-h-11"
        onClick={() => onSubmit({ userId, experimentKey, variant })}
        disabled={!userId || !experimentKey || !variant || isSubmitting}
      >
        {isSubmitting
          ? t('admin.experiments.saving')
          : t('admin.experiments.save')}
      </Button>
    </div>
  );
}
