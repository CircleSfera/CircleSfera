import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Shield, Star } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { paymentsApi } from '../../services/payments.service';
import { profileApi } from '../../services/profile.service';
import { useAuthStore } from '../../stores/authStore';
import { formatCents } from '../../utils/money';
import { sellsInApp } from '../../utils/sellsInApp';
import { LoadingSpinner } from '../LoadingStates';
import { Button } from '../ui';
import PlanWithdrawal from './PlanWithdrawal';
import PlanYearlySwitch from './PlanYearlySwitch';
import SettingsSection from './SettingsSection';
import StudioProBilling from './StudioProBilling';

// A plan can be cancelled while it runs, also with a payment overdue.
const CANCELLABLE = ['ACTIVE', 'TRIALING', 'PAST_DUE'];
// A cancelled plan can be resumed while it is in force, not after a failed
// renewal.
const RESUMABLE = ['ACTIVE', 'TRIALING'];

// A link that names one of the person's Profiles (the email about its free
// year): billing shows the Profile in use, so when that is another one the
// person is offered to switch to it. Only a Profile the account owns is
// offered (the list of its own Profiles, and the server's switch, decide);
// any other id is ignored.
function OtherProfileBilling() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const requested = params.get('profile');
  const activeId = useAuthStore((state) => state.profile?.id);
  const switchProfile = useAuthStore((state) => state.switchProfile);
  const wanted = !!requested && requested !== activeId;
  const { data: mine } = useQuery({
    queryKey: ['my-profiles'],
    queryFn: () => profileApi.getMyProfiles().then((res) => res.data),
    enabled: wanted,
  });
  const other = wanted
    ? mine?.find((profile) => profile.id === requested)
    : undefined;
  const switchTo = useMutation({
    mutationFn: async (profileId: string) => {
      await switchProfile?.(profileId);
    },
    // The app starts again as that Profile, on its billing.
    onSuccess: () => window.location.assign('/accounts/billing'),
    onError: () => toast.error(t('settings.profiles.switch_failed')),
  });
  if (!other) return null;
  return (
    <div
      className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3"
      data-testid="billing-other-profile"
    >
      <p className="text-sm text-white/80">
        {t('settings.billing.other_profile_link', {
          username: other.username,
        })}
      </p>
      <Button
        variant="white"
        className="min-h-11 button-alone text-sm font-semibold"
        isLoading={switchTo.isPending}
        onClick={() => switchTo.mutate(other.id)}
      >
        {t('settings.billing.switch_to_profile', { username: other.username })}
      </Button>
    </div>
  );
}

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

  const resumePlan = useMutation({
    mutationFn: () => paymentsApi.resumePlan(),
    onSuccess: (status) => {
      queryClient.setQueryData(['billingStatus'], status);
      toast.success(t('settings.billing.resume_done'));
    },
    onError: () => {
      toast.error(t('settings.billing.resume_error'));
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
  const freeYear =
    !!subscription?.foundingCreatorYear &&
    subscription.status === 'TRIALING' &&
    !!subscription.currentPeriodEnd;
  const hasActiveSubscription = !!billingStatus?.hasActiveSubscription;
  // The other profiles of the person that have a plan: one payer for all.
  const otherProfiles: {
    profileId: string;
    username: string;
    planName: string;
  }[] = billingStatus?.otherProfiles ?? [];

  return (
    <div className="max-w-xl space-y-5">
      <OtherProfileBilling />
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
            {/* A founding creator's free year (BD-034): nothing is charged
                while it lasts. At its end it goes on with a saved card, or
                ends: when cancelled, or when no VAT can be worked out. */}
            {freeYear && (
              <p
                className="text-xs text-white/70 mt-1"
                data-testid="billing-free-year"
              >
                {t(
                  subscription.freeYearRenewable === false
                    ? 'settings.billing.free_year_ends_no_address'
                    : subscription.cancelAtPeriodEnd
                      ? 'settings.billing.free_year_ends'
                      : 'settings.billing.free_year_until',
                  {
                    date: new Date(
                      subscription.currentPeriodEnd,
                    ).toLocaleDateString(i18n.language, {
                      dateStyle: 'long',
                      timeZone: 'UTC',
                    }),
                    // What a saved card then pays, as the plan says.
                    price: formatCents(
                      subscription.priceCents,
                      i18n.language,
                      subscription.currency,
                    ),
                  },
                )}
              </p>
            )}
            {!freeYear && subscription?.priceCents > 0 && (
              <p className="text-xs text-white/50 mt-1">
                {t(
                  subscription.billingInterval === 'year'
                    ? 'settings.billing.price_yearly'
                    : 'settings.billing.price_monthly',
                  {
                    price: formatCents(
                      subscription.priceCents,
                      i18n.language,
                      subscription.currency,
                    ),
                  },
                )}
              </p>
            )}
            {!freeYear && subscription?.currentPeriodEnd && (
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
          {/* Plans and their billing are handled on the web only: neither
              is offered in the apps, where the plan is only shown. */}
          {sellsInApp() && (
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
          )}
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

        {/* A free year whose VAT cannot be worked out is not resumed: the
            server refuses it, so it is not offered. */}
        {subscription &&
          RESUMABLE.includes(subscription.status) &&
          subscription.cancelAtPeriodEnd &&
          subscription.freeYearRenewable !== false &&
          new Date(subscription.currentPeriodEnd).getTime() > Date.now() && (
            <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
              <p className="text-sm text-white/70">
                {t('settings.billing.resume_hint', {
                  date: new Date(
                    subscription.currentPeriodEnd,
                  ).toLocaleDateString(i18n.language, {
                    dateStyle: 'long',
                    timeZone: 'UTC',
                  }),
                })}
              </p>
              <Button
                variant="white"
                onClick={() => resumePlan.mutate()}
                isLoading={resumePlan.isPending}
                className="min-h-11 button-alone text-sm font-semibold"
              >
                {t('settings.billing.resume')}
              </Button>
            </div>
          )}

        {/* A monthly plan with a yearly price on sale can move to it; the
            server says when (and checks it again). Billing is handled on
            the web only. */}
        {subscription?.yearlyPriceCents > 0 && sellsInApp() && (
          <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <PlanYearlySwitch
              name={subscription.planName}
              monthlyCents={subscription.priceCents}
              yearlyCents={subscription.yearlyPriceCents}
              currency={subscription.currency}
            />
          </div>
        )}

        {/* Within 14 days of the purchase: withdrawing ends the plan now
            and refunds the unused part (the server checks the days). */}
        {subscription?.withdrawableUntil && (
          <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <PlanWithdrawal
              name={subscription.planName}
              until={subscription.withdrawableUntil}
              withdraw={() => paymentsApi.withdrawPlan()}
            />
          </div>
        )}

        <StudioProBilling billingStatus={billingStatus ?? null} />
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
          {!hasActiveSubscription && sellsInApp() && (
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
