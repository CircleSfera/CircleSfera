import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Award,
  BadgeCheck,
  CheckCircle2,
  Loader2,
  Shield,
  Star,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { paymentsApi } from '../../services/payments.service';
import { useAuthStore } from '../../stores/authStore';
import type { PlatformPlanDto } from '../../types';
import {
  apiErrorMessage,
  isIdentityVerificationRequired,
} from '../../utils/apiErrorMessage';
import { promptIdentityVerification } from '../../utils/identityVerification';
import { formatCents } from '../../utils/money';
import { planFeatureLabel } from '../../utils/planFeatures';
import { sellsInApp } from '../../utils/sellsInApp';
import {
  useWithdrawalConsent,
  type WithdrawalConsentGiven,
} from '../payments/WithdrawalConsent';
import { Button, Card } from '../ui';

interface Props {
  onToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

interface BillingStatus {
  hasActiveSubscription?: boolean;
  subscription?: {
    planName?: string;
    status?: string;
  };
}

// The platform plans: the one of the Profile in use, and the others it can
// take.
export default function CreatorPlansTab({ onToast }: Props) {
  const { t, i18n } = useTranslation();
  const profile = useAuthStore((state) => state.profile);

  const currentLevel = profile?.verificationLevel || 'BASIC';

  const { data: plans, isLoading: isLoadingPlans } = useQuery<
    PlatformPlanDto[]
  >({
    queryKey: ['platform-plans'],
    queryFn: paymentsApi.getPlans,
  });

  const { data: billingStatus } = useQuery<BillingStatus>({
    queryKey: ['billingStatus'],
    queryFn: paymentsApi.getBillingStatus,
    retry: false,
  });

  // Before paying: the consent to start at once and the acknowledgement of
  // losing the withdrawal right.
  const consent = useWithdrawalConsent();
  const checkoutMutation = useMutation({
    mutationFn: ({
      planId,
      given,
    }: {
      planId: string;
      given: WithdrawalConsentGiven;
    }) => paymentsApi.createSubscriptionCheckout(planId, 'MONTHLY', given),
    onSuccess: (data) => {
      if (data?.url) window.location.href = data.url;
    },
    onError: (err: unknown) => {
      if (isIdentityVerificationRequired(err)) {
        promptIdentityVerification(t);
        return;
      }
      onToast(apiErrorMessage(err, t, 'creator.plans.error_checkout'), 'error');
    },
  });

  const portalMutation = useMutation({
    mutationFn: paymentsApi.getBillingPortalUrl,
    onSuccess: (data) => {
      if (data?.url) window.location.href = data.url;
    },
    onError: (err: unknown) => {
      onToast(apiErrorMessage(err, t, 'creator.plans.error_portal'), 'error');
    },
  });

  const getTierIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower === 'verified')
      return <BadgeCheck className="text-brand-blue" size={20} />;
    if (lower.includes('premium'))
      return <Star className="text-brand-blue" size={20} />;
    if (lower.includes('elite'))
      return <Award className="text-brand-primary-text" size={20} />;
    if (lower.includes('business'))
      return <Shield className="text-brand-accent" size={20} />;
    return <Zap className="text-brand-primary-text" size={20} />;
  };

  // The plan of the subscription when there is one; otherwise the plan the
  // level stands for. The Verified and Premium plans both give the VERIFIED
  // level, the badge, so without a subscription it stands for Verified.
  const isTierActive = (planName: string) => {
    const lower = planName.toLowerCase();
    if (billingStatus?.hasActiveSubscription) {
      return billingStatus.subscription?.planName?.toLowerCase() === lower;
    }
    if (lower === 'verified') return currentLevel === 'VERIFIED';
    if (lower.includes('elite')) return currentLevel === 'ELITE';
    if (lower.includes('business')) return currentLevel === 'BUSINESS';
    return false;
  };

  const currentPlanLabel =
    billingStatus?.subscription?.planName ||
    (currentLevel === 'BASIC' ? t('creator.plans.free_plan') : currentLevel);

  if (isLoadingPlans) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="animate-spin text-brand-primary-text" size={32} />
        <p className="text-white/50 text-sm">
          {t('creator.plans.loading_plans')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {consent.dialog}
      <div className="space-y-6">
        <Card
          variant="glass"
          className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="min-w-0">
            <p className="text-xs text-white/60">
              {t('creator.plans.subscription_status')}
            </p>
            <h2 className="mt-0.5 text-base font-semibold text-white tracking-tight">
              {t('creator.plans.current_plan', {
                plan: currentPlanLabel,
              })}
            </h2>
          </div>

          {/* Billing is handled on the web only: not in the apps. */}
          {sellsInApp() && (
            <Button
              variant="primary"
              disabled={portalMutation.isPending}
              isLoading={portalMutation.isPending}
              onClick={() => {
                if (
                  !billingStatus?.hasActiveSubscription &&
                  currentLevel === 'BASIC'
                ) {
                  onToast(t('creator.plans.select_plan_start'), 'success');
                } else {
                  portalMutation.mutate();
                }
              }}
              className="min-h-11 px-5 shrink-0"
            >
              {t('creator.plans.manage_subscription')}
            </Button>
          )}
        </Card>

        {/* Pricing Tiers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans?.map((plan) => {
            const displayName = plan.name;
            const active = isTierActive(plan.name);
            return (
              <div
                key={plan.id}
                className={`p-5 rounded-xl border transition-colors flex flex-col justify-between space-y-5 ${
                  active
                    ? 'border-brand-primary/40 bg-brand-primary/10'
                    : 'border-white/5 glass-panel hover:bg-white/5'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    {getTierIcon(plan.name)}
                    {active && (
                      <span className="px-2.5 py-0.5 rounded-lg bg-brand-primary/15 text-brand-primary-text text-[11px] font-medium">
                        {t('creator.plans.active')}
                      </span>
                    )}
                  </div>

                  <h4 className="text-lg font-bold text-white tracking-tight mb-1">
                    {displayName}
                  </h4>

                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-semibold text-white tabular-nums tracking-tight">
                      {formatCents(
                        plan.priceCents ?? 0,
                        i18n.language,
                        plan.currency || 'EUR',
                      )}
                    </span>
                    <span className="text-xs text-white/50">
                      {plan.interval === 'month'
                        ? t('creator.plans.per_month')
                        : t('creator.plans.per_year')}
                    </span>
                  </div>
                  <p className="mt-1 mb-4 text-xs text-white/50">
                    {t('vat.included')}
                  </p>

                  <ul className="space-y-2 pt-3 border-t border-white/6">
                    {plan.features.map((feature: string) => (
                      <li
                        key={feature}
                        className="flex items-center gap-2 text-xs text-white/70"
                      >
                        <CheckCircle2
                          size={14}
                          className="text-brand-primary-text shrink-0"
                        />
                        <span>{planFeatureLabel(feature, t)}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Plans are bought on the web only: not in the apps. */}
                {!active && !sellsInApp() && (
                  <p className="text-sm text-white/60">
                    {t('pricingPage.not_in_app')}
                  </p>
                )}
                {!active && sellsInApp() && (
                  <Button
                    variant="secondary"
                    disabled={checkoutMutation.isPending}
                    isLoading={checkoutMutation.isPending}
                    onClick={() =>
                      consent.ask((given) =>
                        checkoutMutation.mutate({ planId: plan.id, given }),
                      )
                    }
                    className="button-alone min-h-11"
                  >
                    {t('creator.plans.upgrade_now')}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
