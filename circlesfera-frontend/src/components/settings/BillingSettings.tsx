import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Shield, Star } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { paymentsApi } from '../../services/payments.service';
import { useAuthStore } from '../../stores/authStore';
import { LoadingSpinner } from '../LoadingStates';
import { Button } from '../ui';
import SettingsSection from './SettingsSection';

// A plan can be cancelled while it runs, also with a payment overdue.
const CANCELLABLE = ['ACTIVE', 'TRIALING', 'PAST_DUE'];

export default function BillingSettings() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [isProcessingPortal, setIsProcessingPortal] = useState(false);
  // Cancelling takes two steps: the button, then the confirmation.
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const username = useAuthStore((state) => state.profile?.username);
  const queryClient = useQueryClient();

  const { data: billingStatus, isLoading } = useQuery({
    queryKey: ['billingStatus'],
    queryFn: () => paymentsApi.getBillingStatus(),
    retry: false,
  });

  const handleUpgrade = () => navigate('/pricing');

  const cancelPlan = useMutation({
    mutationFn: () => paymentsApi.cancelPlan(),
    onSuccess: (status) => {
      queryClient.setQueryData(['billingStatus'], status);
      setConfirmingCancel(false);
      toast.success(t('settings.billing.cancel_done'));
    },
    onError: () => {
      toast.error(t('settings.billing.cancel_error'));
    },
  });

  const handleBillingPortal = async () => {
    try {
      setIsProcessingPortal(true);
      const response = await paymentsApi.getBillingPortalUrl();
      if (response.url) {
        window.location.href = response.url;
      }
    } catch {
      toast.error(t('settings.billing.portal_error'));
    } finally {
      setIsProcessingPortal(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  const subscription = billingStatus?.subscription;
  const hasActiveSubscription = !!billingStatus?.hasActiveSubscription;
  // The other profiles of the person that have a plan: one payer for all.
  const otherProfiles: {
    profileId: string;
    username: string;
    planName: string;
  }[] = billingStatus?.otherProfiles ?? [];

  return (
    <div className="max-w-xl space-y-5">
      <SettingsSection
        title={t('settings.billing.title')}
        description={t('settings.billing.subtitle_profile', { username })}
        card={false}
      >
        <div className="rounded-xl border border-white/5 bg-brand-primary/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-brand-primary-text mb-1">
              {t('settings.billing.current_plan')}
            </p>
            <h3 className="text-xl font-semibold text-white">
              {subscription?.planName || t('settings.billing.free')}
            </h3>
            <p className="text-xs text-white/50 mt-1">
              {subscription?.status
                ? t(
                    `settings.billing.status_${subscription.status.toLowerCase()}`,
                    { defaultValue: subscription.status },
                  )
                : t('settings.billing.no_subscription')}
            </p>
            {subscription?.currentPeriodEnd && (
              <p className="text-xs text-white/40 mt-1">
                {subscription.cancelAtPeriodEnd
                  ? t('settings.billing.cancels_on')
                  : t('settings.billing.renews_on')}{' '}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString(
                  i18n.language,
                  { dateStyle: 'long', timeZone: 'UTC' },
                )}
              </p>
            )}
          </div>
          <Button
            onClick={
              hasActiveSubscription ? handleBillingPortal : handleUpgrade
            }
            isLoading={isProcessingPortal}
            variant="white"
            className="min-h-11 px-6 text-sm font-semibold shrink-0"
          >
            {hasActiveSubscription
              ? t('settings.billing.manage')
              : t('settings.billing.view_plans')}
          </Button>
        </div>

        {subscription &&
          CANCELLABLE.includes(subscription.status) &&
          !subscription.cancelAtPeriodEnd && (
            <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.02] p-4">
              {confirmingCancel ? (
                <div className="space-y-3">
                  <p className="text-sm text-white">
                    {t('settings.billing.cancel_confirm', {
                      plan: subscription.planName,
                      date: new Date(
                        subscription.currentPeriodEnd,
                      ).toLocaleDateString(i18n.language, {
                        dateStyle: 'long',
                        timeZone: 'UTC',
                      }),
                    })}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      variant="danger"
                      onClick={() => cancelPlan.mutate()}
                      isLoading={cancelPlan.isPending}
                      className="min-h-11 text-sm font-semibold"
                    >
                      {t('settings.billing.cancel_confirm_button')}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setConfirmingCancel(false)}
                      disabled={cancelPlan.isPending}
                      className="min-h-11 text-sm font-semibold"
                    >
                      {t('settings.billing.cancel_keep')}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => setConfirmingCancel(true)}
                  className="min-h-11 button-alone text-sm font-semibold"
                >
                  {t('settings.billing.cancel')}
                </Button>
              )}
            </div>
          )}
      </SettingsSection>

      {otherProfiles.length > 0 && (
        <SettingsSection
          title={t('settings.billing.other_profiles')}
          description={t('settings.billing.other_profiles_desc')}
        >
          <ul className="divide-y divide-white/5">
            {otherProfiles.map((other) => (
              <li
                key={other.profileId}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <span className="min-w-0 truncate text-sm font-semibold text-white">
                  @{other.username}
                </span>
                <span className="shrink-0 text-sm text-white/70">
                  {other.planName}
                </span>
              </li>
            ))}
          </ul>
          {!hasActiveSubscription && (
            <div className="px-4 pb-4">
              <Button
                onClick={handleBillingPortal}
                isLoading={isProcessingPortal}
                variant="secondary"
                className="min-h-11 button-alone text-sm font-semibold"
              >
                {t('settings.billing.manage')}
              </Button>
            </div>
          )}
        </SettingsSection>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center shrink-0">
            <Shield size={18} className="text-brand-primary-text" aria-hidden />
          </div>
          <div>
            <h4 className="text-sm font-medium text-white">
              {t('settings.billing.verified_badge')}
            </h4>
            <p className="text-xs text-white/50">
              {t('settings.billing.verified_desc')}
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center shrink-0">
            <Star size={18} className="text-brand-primary-text" aria-hidden />
          </div>
          <div>
            <h4 className="text-sm font-medium text-white">
              {t('settings.billing.pro_insights')}
            </h4>
            <p className="text-xs text-white/50">
              {t('settings.billing.pro_desc')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
