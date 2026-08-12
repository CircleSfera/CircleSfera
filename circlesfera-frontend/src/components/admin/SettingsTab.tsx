import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type AdminSystemSetting,
  adminApi,
} from '../../services/admin.service';
import { Button } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminListSkeleton } from './AdminSkeletons';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export default function SettingsTab({ onToast }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<AdminSystemSetting[]>({
    queryKey: ['admin', 'settings'],
    queryFn: adminApi.getSystemSettings,
  });

  const [formState, setFormState] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settings) {
      const initial: Record<string, string> = {};
      settings.forEach((s) => {
        initial[s.key] = s.value;
      });
      setFormState(initial);
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: (updates: { key: string; value: string }[]) =>
      adminApi.updateSystemSettings(updates),
    onSuccess: () => {
      onToast(t('admin.settings.saved_success'), 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
    onError: () => {
      onToast(t('admin.settings.saved_error'), 'error');
    },
  });

  const hasChanges =
    settings?.some((s) => formState[s.key] !== s.value) ?? false;

  const handleSave = () => {
    if (!settings) return;
    const updates = settings
      .filter((s) => formState[s.key] !== s.value)
      .map((s) => ({ key: s.key, value: formState[s.key] }));

    if (updates.length > 0) {
      updateMutation.mutate(updates);
    }
  };

  const handleChange = (key: string, value: string) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        <AdminPageHeader
          title={t('admin.settings.title')}
          subtitle={t('admin.settings.subtitle')}
        />
        <div className="p-2.5 sm:p-3 md:p-4">
          <AdminListSkeleton />
        </div>
      </div>
    );
  }

  if (!settings || settings.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <AdminPageHeader
          title={t('admin.settings.title')}
          subtitle={t('admin.settings.subtitle')}
        />
        <AdminEmptyState
          icon={Settings2}
          title={t('admin.settings.empty_title')}
          description={t('admin.settings.empty_description')}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <AdminPageHeader
        title={t('admin.settings.title')}
        subtitle={t('admin.settings.subtitle')}
        actions={
          <Button
            onClick={handleSave}
            disabled={!hasChanges || updateMutation.isPending}
            variant="primary"
            className="gap-2"
          >
            <Save className="w-4 h-4" />
            {updateMutation.isPending
              ? t('admin.settings.saving')
              : t('admin.settings.save')}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-2.5 sm:p-3 md:p-4">
        <div className="max-w-3xl space-y-2.5 sm:space-y-3">
          <div className="bg-white/2 border border-white/5 rounded-lg p-2.5 sm:p-3 md:p-4">
            <h3 className="text-base font-semibold text-white mb-4">
              {t('admin.settings.main_section')}
            </h3>

            <div className="space-y-2.5">
              {settings.map((setting) => {
                const isBoolean =
                  setting.value === 'true' || setting.value === 'false';
                const value = formState[setting.key] ?? setting.value;
                const fieldId = `setting_${setting.key}`;

                return (
                  <div
                    key={setting.key}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 border-b border-white/5 last:border-0"
                  >
                    <label
                      htmlFor={fieldId}
                      className="text-sm text-white/80 font-medium"
                    >
                      {t(`admin.settings.keys.${setting.key}`, setting.key)}
                      <span className="block text-xs text-white/40 font-normal mt-0.5">
                        {t(
                          `admin.settings.descriptions.${setting.key}`,
                          setting.description || '',
                        )}
                      </span>
                    </label>
                    {isBoolean ? (
                      <button
                        id={fieldId}
                        type="button"
                        onClick={() =>
                          handleChange(
                            setting.key,
                            value === 'true' ? 'false' : 'true',
                          )
                        }
                        className="min-h-11 min-w-11 inline-flex items-center justify-center shrink-0"
                        aria-pressed={value === 'true'}
                      >
                        <span
                          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                            value === 'true'
                              ? 'bg-brand-primary'
                              : 'bg-white/10'
                          }`}
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                              value === 'true'
                                ? 'translate-x-6'
                                : 'translate-x-1'
                            }`}
                          />
                        </span>
                      </button>
                    ) : (
                      <input
                        id={fieldId}
                        type="text"
                        value={value}
                        onChange={(e) =>
                          handleChange(setting.key, e.target.value)
                        }
                        className="w-full sm:w-64 rounded-lg bg-surface-elevated border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
