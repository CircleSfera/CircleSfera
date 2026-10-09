import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type AdminPlan,
  type AdminPlanChanges,
  adminApi,
} from '../../services/admin.service';
import { adminAuthApi } from '../../services/admin-auth.service';
import {
  apiErrorBody,
  apiErrorMessage,
  apiErrorStatus,
} from '../../utils/apiErrorMessage';
import { formatCents } from '../../utils/money';
import { Button, Input, Switch, Textarea } from '../ui';
import { AdminEmptyState } from './AdminEmptyState';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminListSkeleton } from './AdminSkeletons';

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void;
}

const DESCRIPTION_MAX = 280;

function isStepUpRequired(err: unknown): boolean {
  const body = apiErrorBody(err) as
    | { message?: string; code?: string; errorCode?: string }
    | undefined;
  return (
    apiErrorStatus(err) === 401 &&
    [body?.code, body?.errorCode, body?.message].includes(
      'ADMIN_STEP_UP_REQUIRED',
    )
  );
}

interface Draft {
  features: string[];
  description: string;
  isActive: boolean;
}

const draftOf = (plan: AdminPlan): Draft => ({
  features: plan.features,
  description: plan.description ?? '',
  isActive: plan.isActive,
});

/** Only what differs from the saved plan. */
function changesOf(plan: AdminPlan, draft: Draft): AdminPlanChanges {
  const saved = draftOf(plan);
  const sameFeatures =
    saved.features.length === draft.features.length &&
    saved.features.every((key) => draft.features.includes(key));
  return {
    ...(!sameFeatures && { features: draft.features }),
    ...(saved.description !== draft.description.trim() && {
      description: draft.description.trim(),
    }),
    ...(saved.isActive !== draft.isActive && { isActive: draft.isActive }),
  };
}

/**
 * The plan catalogue: what each platform plan includes and whether it is on
 * sale. Prices are shown and cannot be changed here, because Stripe is who
 * charges. Saving asks for the authenticator code.
 */
export default function PlansTab({ onToast }: Props) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [pending, setPending] = useState<{
    id: string;
    changes: AdminPlanChanges;
  } | null>(null);
  const [code, setCode] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: () => adminApi.getPlans().then((res) => res.data),
  });

  const saved = (id: string) => {
    setDrafts(({ [id]: _saved, ...rest }) => rest);
    setPending(null);
    setCode('');
    void queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] });
    onToast(t('admin.plans.toast_saved'), 'success');
  };

  const saveMutation = useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: AdminPlanChanges }) =>
      adminApi.updatePlan(id, changes),
    onSuccess: (_res, { id }) => saved(id),
    onError: (err, variables) => {
      if (isStepUpRequired(err)) {
        setPending(variables);
        return;
      }
      onToast(apiErrorMessage(err, t, 'admin.plans.toast_failed'), 'error');
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!pending) return;
      await adminAuthApi.stepUp({ totpCode: code.trim() });
      await adminApi.updatePlan(pending.id, pending.changes);
    },
    onSuccess: () => {
      if (pending) saved(pending.id);
    },
    onError: () => onToast(t('admin.operators.step_up_failed'), 'error'),
  });

  if (isLoading) return <AdminListSkeleton />;
  if (isError || !data) {
    return <AdminEmptyState title={t('admin.plans.load_failed')} />;
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t('admin.plans.title')}
        subtitle={t('admin.plans.subtitle')}
      />

      {data.plans.length === 0 && (
        <AdminEmptyState title={t('admin.plans.empty')} />
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {data.plans.map((plan) => {
          const draft = drafts[plan.id] ?? draftOf(plan);
          const changes = changesOf(plan, draft);
          const dirty = Object.keys(changes).length > 0;
          const confirming = pending?.id === plan.id;
          const edit = (patch: Partial<Draft>) =>
            setDrafts((all) => ({ ...all, [plan.id]: { ...draft, ...patch } }));

          return (
            <section
              key={plan.id}
              aria-labelledby={`plan-${plan.id}`}
              className="glass-panel rounded-2xl p-4 space-y-4"
            >
              <div>
                <h3
                  id={`plan-${plan.id}`}
                  className="text-base font-bold text-white"
                >
                  {plan.name}
                </h3>
                <p className="mt-1 text-sm text-white/70">
                  {t('admin.plans.price_month', {
                    price: formatCents(
                      plan.priceCents,
                      i18n.language,
                      plan.currency,
                    ),
                  })}
                  {plan.yearlyPriceCents != null &&
                    ` · ${t('admin.plans.price_year', {
                      price: formatCents(
                        plan.yearlyPriceCents,
                        i18n.language,
                        plan.currency,
                      ),
                    })}`}
                </p>
                <p className="mt-1 text-xs text-white/45">
                  {t('admin.plans.price_note')}
                </p>
              </div>

              <Switch
                label={t('admin.plans.on_sale')}
                aria-label={t('admin.plans.on_sale')}
                description={t('admin.plans.on_sale_hint')}
                checked={draft.isActive}
                onChange={(e) => edit({ isActive: e.target.checked })}
              />

              <fieldset className="space-y-1">
                <legend className="text-sm font-medium text-white mb-1">
                  {t('admin.plans.includes')}
                </legend>
                {data.featureKeys.map((key) => (
                  <label
                    key={key}
                    className="flex min-h-11 items-center gap-3 text-sm text-white/85 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="h-5 w-5 shrink-0 accent-brand-primary"
                      checked={draft.features.includes(key)}
                      onChange={(e) =>
                        edit({
                          features: e.target.checked
                            ? [...draft.features, key]
                            : draft.features.filter((k) => k !== key),
                        })
                      }
                    />
                    {t(`pricingPage.features.${key}`, key)}
                  </label>
                ))}
              </fieldset>

              <Textarea
                label={t('admin.plans.description')}
                value={draft.description}
                maxLength={DESCRIPTION_MAX}
                onChange={(e) => edit({ description: e.target.value })}
              />

              {confirming ? (
                <div className="space-y-2">
                  <p className="text-sm text-white/70">
                    {t('admin.operators.step_up_hint')}
                  </p>
                  <Input
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    placeholder="000000"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    aria-label={t('admin.operators.step_up_required')}
                    className="font-mono tracking-widest text-center"
                    maxLength={6}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      className="flex-1"
                      disabled={code.length < 6 || confirmMutation.isPending}
                      isLoading={confirmMutation.isPending}
                      onClick={() => confirmMutation.mutate()}
                    >
                      {t('admin.operators.confirm')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setPending(null);
                        setCode('');
                      }}
                    >
                      {t('common.cancel')}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  className="w-full"
                  disabled={!dirty || saveMutation.isPending}
                  isLoading={
                    saveMutation.isPending &&
                    saveMutation.variables?.id === plan.id
                  }
                  onClick={() => saveMutation.mutate({ id: plan.id, changes })}
                >
                  {t('admin.plans.save')}
                </Button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
