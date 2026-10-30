import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Award,
  BadgeCheck,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Shield,
  Star,
  Zap,
} from 'lucide-react';
import { useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { monetizationApi } from '../../services/monetization.service';
import { paymentsApi } from '../../services/payments.service';
import { useAuthStore } from '../../stores/authStore';
import type { PlatformPlanDto } from '../../types';
import {
  apiErrorMessage,
  isIdentityVerificationRequired,
} from '../../utils/apiErrorMessage';
import { promptIdentityVerification } from '../../utils/identityVerification';
import { formatCents } from '../../utils/money';
import {
  dropPendingTab,
  openPendingTab,
  sendPendingTab,
} from '../../utils/pendingTab';
import { planFeatureLabel } from '../../utils/planFeatures';
import MonetizationDashboard from '../monetization/MonetizationDashboard';
import {
  useWithdrawalConsent,
  type WithdrawalConsentGiven,
} from '../payments/WithdrawalConsent';
import { Button, Card } from '../ui';
import { CreatorFigure, CreatorFigures, CreatorSection } from './CreatorPieces';
import CreatorPpvIncome from './CreatorPpvIncome';

interface Props {
  onToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  // Income = Connect/VIP; plans = platform tiers; all = both (default).
  section?: 'income' | 'plans' | 'all';
}

interface MonetizationSummary {
  hasStripeAccount?: boolean;
  lifetimeEarningsCents?: number;
}

interface MonetizationConnectStatus {
  connected?: boolean;
  transfersEnabled?: boolean;
  detailsSubmitted?: boolean;
}

interface BillingStatus {
  hasActiveSubscription?: boolean;
  subscription?: {
    planName?: string;
    status?: string;
  };
}

export default function CreatorMonetizationTab({
  onToast,
  section = 'all',
}: Props) {
  const showIncome = section === 'all' || section === 'income';
  const showPlans = section === 'all' || section === 'plans';
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const profile = useAuthStore((state) => state.profile);

  const currentLevel = profile?.verificationLevel || 'BASIC';

  const { data: plans, isLoading: isLoadingPlans } = useQuery<
    PlatformPlanDto[]
  >({
    queryKey: ['platform-plans'],
    queryFn: paymentsApi.getPlans,
    enabled: showPlans,
  });

  const { data: monetization, isLoading: isLoadingMonetization } =
    useQuery<MonetizationSummary>({
      queryKey: ['monetization'],
      queryFn: monetizationApi.getMonetization,
    });

  const hasStripeAccount = !!monetization?.hasStripeAccount;

  const { data: connectStatus } = useQuery<MonetizationConnectStatus>({
    queryKey: ['monetization-status'],
    queryFn: monetizationApi.getStatus,
    enabled: hasStripeAccount,
  });

  const { data: billingStatus } = useQuery<BillingStatus>({
    queryKey: ['billingStatus'],
    queryFn: paymentsApi.getBillingStatus,
    retry: false,
  });

  useEffect(() => {
    if (searchParams.get('connect_success') !== 'true') return;
    toast.success(t('creator.income.connect_success'));
    const params = new URLSearchParams(searchParams);
    params.delete('connect_success');
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams, t]);

  const connectMutation = useMutation({
    mutationFn: () => {
      const returnUrl = `${window.location.origin}/creator/monetization?connect_success=true`;
      const refreshUrl = `${window.location.origin}/creator/monetization`;
      return monetizationApi.connectAccount(returnUrl, refreshUrl);
    },
    onSuccess: (data: { url?: string }) => {
      if (data.url) window.location.href = data.url;
    },
    // The server text is in one language and can be technical.
    onError: (err: unknown) => {
      if (isIdentityVerificationRequired(err)) {
        promptIdentityVerification(t);
        return;
      }
      onToast(
        apiErrorMessage(err, t, 'creator.monetization.error_connect'),
        'error',
      );
    },
  });

  // The tab is opened at the tap and filled when the link arrives: opened
  // after the wait, a phone refuses it and says nothing.
  const dashboardMutation = useMutation({
    mutationFn: (_tab: Window | null) => monetizationApi.getDashboardLink(),
    onSuccess: (data, tab) => {
      sendPendingTab(tab, data.url);
    },
    onError: (err: unknown, tab) => {
      dropPendingTab(tab);
      onToast(
        apiErrorMessage(err, t, 'creator.monetization.error_dashboard'),
        'error',
      );
    },
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
      onToast(
        apiErrorMessage(err, t, 'creator.monetization.error_checkout'),
        'error',
      );
    },
  });

  const portalMutation = useMutation({
    mutationFn: paymentsApi.getBillingPortalUrl,
    onSuccess: (data) => {
      if (data?.url) window.location.href = data.url;
    },
    onError: (err: unknown) => {
      onToast(
        apiErrorMessage(err, t, 'creator.monetization.error_portal'),
        'error',
      );
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
    (currentLevel === 'BASIC'
      ? t('creator.monetization.free_plan')
      : currentLevel);

  if ((showPlans && isLoadingPlans) || isLoadingMonetization) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="animate-spin text-brand-primary-text" size={32} />
        <p className="text-white/50 text-sm">
          {t('creator.monetization.loading_plans')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {consent.dialog}
      {showIncome && (
        <div className="space-y-8">
          <CreatorPpvIncome
            isConnecting={connectMutation.isPending}
            onConnect={() => connectMutation.mutate()}
            showConnect={!hasStripeAccount}
          />
          {hasStripeAccount ? (
            <CreatorSection
              title={t('creator.monetization.stripe_connected')}
              hint={t('creator.monetization.stripe_connected_desc')}
              action={
                <Button
                  variant="secondary"
                  disabled={dashboardMutation.isPending}
                  onClick={() => dashboardMutation.mutate(openPendingTab())}
                  isLoading={dashboardMutation.isPending}
                  className="min-h-11 px-4 shrink-0"
                >
                  {t('creator.monetization.express_dashboard')}
                  <ExternalLink size={14} className="ml-1.5" aria-hidden />
                </Button>
              }
            >
              <CreatorFigures>
                <CreatorFigure
                  label={t('creator.monetization.lifetime')}
                  value={formatCents(
                    monetization?.lifetimeEarningsCents || 0,
                    i18n.language,
                  )}
                  hint={
                    connectStatus
                      ? connectStatus.transfersEnabled
                        ? t('creator.monetization.transfers_enabled')
                        : t('creator.monetization.transfers_pending')
                      : undefined
                  }
                />
              </CreatorFigures>
            </CreatorSection>
          ) : null}
          <MonetizationDashboard />
        </div>
      )}

      {showPlans && (
        <div className="space-y-6">
          <Card
            variant="glass"
            className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="text-xs text-white/60">
                {t('creator.monetization.subscription_status')}
              </p>
              <h2 className="mt-0.5 text-base font-semibold text-white tracking-tight">
                {t('creator.monetization.current_plan', {
                  plan: currentPlanLabel,
                })}
              </h2>
            </div>

            <Button
              variant="primary"
              disabled={portalMutation.isPending}
              isLoading={portalMutation.isPending}
              onClick={() => {
                if (
                  !billingStatus?.hasActiveSubscription &&
                  currentLevel === 'BASIC'
                ) {
                  onToast(
                    t('creator.monetization.select_plan_start'),
                    'success',
                  );
                } else {
                  portalMutation.mutate();
                }
              }}
              className="min-h-11 px-5 shrink-0"
            >
              {t('creator.monetization.manage_subscription')}
            </Button>
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
                          {t('creator.monetization.active')}
                        </span>
                      )}
                    </div>

                    <h4 className="text-lg font-bold text-white tracking-tight mb-1">
                      {displayName}
                    </h4>

                    <div className="flex items-baseline gap-1 mb-4">
                      <span className="text-2xl font-semibold text-white tabular-nums tracking-tight">
                        {formatCents(
                          plan.priceCents ?? 0,
                          i18n.language,
                          plan.currency || 'EUR',
                        )}
                      </span>
                      <span className="text-xs text-white/50">
                        {plan.interval === 'month'
                          ? t('creator.monetization.per_month')
                          : t('creator.monetization.per_year')}{' '}
                        {t('creator.monetization.plus_vat')}
                      </span>
                    </div>

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

                  {!active && (
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
                      {t('creator.monetization.upgrade_now')}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
