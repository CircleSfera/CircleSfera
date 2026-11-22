import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { paymentsApi } from '../../services/payments.service';
import { studioProState } from '../../utils/plans';
import { Button } from '../ui';
import PlanWithdrawal from './PlanWithdrawal';

type Subscription = {
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  // The last moment to withdraw from it, within 14 days of buying it.
  withdrawableUntil?: string | null;
};

interface StudioProBillingProps {
  billingStatus: {
    studioPro?: {
      includedInPlan?: boolean;
      subscription?: Subscription | null;
    };
  } | null;
}

// A cancelled add-on can be resumed while it is in force.
const RESUMABLE = ['ACTIVE', 'TRIALING'];
const CANCELLABLE = ['ACTIVE', 'TRIALING', 'PAST_DUE'];

// The Edits Studio Pro add-on of the Profile in use: held beside its plan,
// cancelled and resumed on its own, or included with the plan. Nothing is
// shown when the Profile has neither.
export default function StudioProBilling({
  billingStatus,
}: StudioProBillingProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const state = studioProState(billingStatus);
  const subscription = billingStatus?.studioPro?.subscription ?? null;

  const cancel = useMutation({
    mutationFn: () => paymentsApi.cancelStudioPro(),
    onSuccess: () => {
      setConfirmingCancel(false);
      toast.success(t('settings.billing.studio_pro.cancel_done'));
    },
    onError: () => toast.error(t('settings.billing.studio_pro.cancel_error')),
    // Asked again rather than taken from the answer: the plan's own
    // cancel may answer at the same time.
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['billingStatus'] }),
  });

  const resume = useMutation({
    mutationFn: () => paymentsApi.resumeStudioPro(),
    onSuccess: () => {
      toast.success(t('settings.billing.studio_pro.resume_done'));
    },
    onError: () => toast.error(t('settings.billing.studio_pro.resume_error')),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['billingStatus'] }),
  });

  if (state === 'none' && !subscription) return null;

  const date = (value: string) =>
    new Date(value).toLocaleDateString(i18n.language, {
      dateStyle: 'long',
      timeZone: 'UTC',
    });

  return (
    <div
      className="mt-3 rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-3"
      data-testid="studio-pro-billing"
    >
      <div>
        <h3 className="text-base font-semibold text-white">
          {t('settings.billing.studio_pro.title')}
        </h3>
        {state === 'included' ? (
          <p className="text-xs text-white/50 mt-1">
            {t('settings.billing.studio_pro.included')}
          </p>
        ) : subscription ? (
          <p className="text-xs text-white/50 mt-1">
            {t(`settings.billing.status_${subscription.status.toLowerCase()}`, {
              defaultValue: subscription.status,
            })}
            {' · '}
            {subscription.cancelAtPeriodEnd
              ? t('settings.billing.cancels_on')
              : t('settings.billing.renews_on')}{' '}
            {date(subscription.currentPeriodEnd)}
          </p>
        ) : null}
      </div>

      {subscription &&
        CANCELLABLE.includes(subscription.status) &&
        !subscription.cancelAtPeriodEnd &&
        (confirmingCancel ? (
          <div className="space-y-3">
            <p className="text-sm text-white">
              {t('settings.billing.studio_pro.cancel_confirm', {
                date: date(subscription.currentPeriodEnd),
              })}
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="danger"
                onClick={() => cancel.mutate()}
                isLoading={cancel.isPending}
                className="min-h-11 text-sm font-semibold self-start"
              >
                {t('settings.billing.studio_pro.cancel_confirm_button')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirmingCancel(false)}
                disabled={cancel.isPending}
                className="min-h-11 text-sm font-semibold self-start"
              >
                {t('settings.billing.studio_pro.keep')}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="secondary"
            onClick={() => setConfirmingCancel(true)}
            className="min-h-11 button-alone text-sm font-semibold"
          >
            {t('settings.billing.studio_pro.cancel')}
          </Button>
        ))}

      {subscription?.withdrawableUntil && (
        <PlanWithdrawal
          name={t('settings.billing.studio_pro.title')}
          until={subscription.withdrawableUntil}
          withdraw={() => paymentsApi.withdrawStudioPro()}
        />
      )}

      {subscription &&
        RESUMABLE.includes(subscription.status) &&
        subscription.cancelAtPeriodEnd &&
        new Date(subscription.currentPeriodEnd).getTime() > Date.now() &&
        // Not resumed beside a plan that already includes it.
        !billingStatus?.studioPro?.includedInPlan && (
          <div className="space-y-3">
            <p className="text-sm text-white/70">
              {t('settings.billing.studio_pro.resume_hint', {
                date: date(subscription.currentPeriodEnd),
              })}
            </p>
            <Button
              variant="white"
              onClick={() => resume.mutate()}
              isLoading={resume.isPending}
              className="min-h-11 button-alone text-sm font-semibold"
            >
              {t('settings.billing.studio_pro.resume')}
            </Button>
          </div>
        )}
    </div>
  );
}
