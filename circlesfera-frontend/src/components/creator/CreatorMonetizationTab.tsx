import { useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Award,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Shield,
  Star,
  TrendingUp,
  Users,
  Wallet,
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
import MonetizationDashboard from '../monetization/MonetizationDashboard';
import { Button } from '../ui';
import CreatorPpvIncome from './CreatorPpvIncome';

interface Props {
  onToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  /** income = Connect/VIP; plans = platform tiers; all = both (default). */
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
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const profile = useAuthStore((state) => state.profile);
  const user = profile?.user;

  const currentLevel = user?.verificationLevel || 'BASIC';

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
    toast.success(
      t(
        'creator.income.connect_success',
        'Stripe account linked successfully.',
      ),
    );
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
    onError: (err: Error) => {
      onToast(err.message || 'Error connecting to Stripe', 'error');
    },
  });

  const dashboardMutation = useMutation({
    mutationFn: () => monetizationApi.getDashboardLink(),
    onSuccess: (data) => {
      window.open(data.url, '_blank');
    },
    onError: (err: Error) => {
      onToast(err.message || 'Error opening dashboard', 'error');
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: (planId: string) =>
      paymentsApi.createSubscriptionCheckout(planId),
    onSuccess: (data) => {
      if (data?.url) window.location.href = data.url;
    },
    onError: (err: Error) => {
      onToast(err.message || t('creator.monetization.error_checkout'), 'error');
    },
  });

  const portalMutation = useMutation({
    mutationFn: paymentsApi.getBillingPortalUrl,
    onSuccess: (data) => {
      if (data?.url) window.location.href = data.url;
    },
    onError: (err: Error) => {
      onToast(err.message || t('creator.monetization.error_portal'), 'error');
    },
  });

  const getTierIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('premium'))
      return <Star className="text-brand-blue" size={20} />;
    if (lower.includes('elite'))
      return <Award className="text-brand-primary" size={20} />;
    if (lower.includes('business'))
      return <Shield className="text-brand-accent" size={20} />;
    return <Zap className="text-brand-primary" size={20} />;
  };

  const isTierActive = (planName: string) => {
    const billingPlan = billingStatus?.subscription?.planName?.toLowerCase();
    if (billingPlan && billingStatus?.hasActiveSubscription) {
      return billingPlan.includes(planName.toLowerCase());
    }
    const lower = planName.toLowerCase();
    if (lower.includes('premium')) return currentLevel === 'VERIFIED';
    if (lower.includes('elite')) return currentLevel === 'ELITE';
    if (lower.includes('business')) return currentLevel === 'BUSINESS';
    return false;
  };

  const currentPlanLabel =
    billingStatus?.subscription?.planName ||
    (currentLevel === 'BASIC' ? 'Experiencia Gratuita' : currentLevel);

  if ((showPlans && isLoadingPlans) || isLoadingMonetization) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="animate-spin text-brand-primary" size={32} />
        <p className="text-white/50 text-sm">
          {t(
            'creator.monetization.loading_plans',
            'Loading monetization options…',
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {showIncome && (
        <div className="space-y-4">
          <CreatorPpvIncome
            isConnecting={connectMutation.isPending}
            onConnect={() => connectMutation.mutate()}
            showConnect={!hasStripeAccount}
          />
          {hasStripeAccount ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-5 rounded-xl border border-white/5 glass-panel space-y-4"
            >
              <div className="flex items-center gap-3">
                <Wallet size={18} className="text-brand-primary" aria-hidden />
                <div>
                  <h3 className="text-lg font-semibold text-white tracking-tight">
                    {t(
                      'creator.monetization.stripe_connected',
                      'Stripe account connected',
                    )}
                  </h3>
                  <p className="text-xs text-white/50">
                    {t(
                      'creator.monetization.stripe_connected_desc',
                      'Stripe splits each charge (80% you / 20% CircleSfera) and pays out to your bank.',
                    )}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-white/3 border border-white/5">
                <div>
                  <span className="text-xs text-white/50">
                    {t('creator.monetization.lifetime', 'Lifetime earnings')}
                  </span>
                  <p className="text-2xl font-semibold text-white tabular-nums mt-0.5">
                    €
                    {((monetization?.lifetimeEarningsCents || 0) / 100).toFixed(
                      2,
                    )}
                  </p>
                  {connectStatus && (
                    <span className="inline-block mt-1 text-[11px] text-brand-primary">
                      {connectStatus.transfersEnabled
                        ? t(
                            'creator.monetization.transfers_enabled',
                            'Transferencias activadas',
                          )
                        : t(
                            'creator.monetization.transfers_pending',
                            'Transferencias en configuración',
                          )}
                    </span>
                  )}
                </div>

                <Button
                  variant="secondary"
                  disabled={dashboardMutation.isPending}
                  onClick={() => dashboardMutation.mutate()}
                  isLoading={dashboardMutation.isPending}
                  className="min-h-11 px-4"
                >
                  {t('creator.monetization.express_dashboard', 'Open Stripe')}
                  <ExternalLink size={14} className="ml-1.5" />
                </Button>
              </div>
            </motion.div>
          ) : null}
          <MonetizationDashboard />
        </div>
      )}

      {showPlans && (
        <div className="space-y-6">
          {/* Subscription Status Header */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-5 rounded-xl border border-white/5 glass-panel flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-primary/15 flex items-center justify-center text-brand-primary shrink-0">
                <Zap size={20} />
              </div>
              <div>
                <span className="text-xs text-white/50">
                  {t(
                    'creator.monetization.subscription_status',
                    'Subscription',
                  )}
                </span>
                <h3 className="text-lg font-semibold text-white tracking-tight">
                  {t('creator.monetization.current_plan', {
                    plan: currentPlanLabel,
                    defaultValue: 'Current plan: {{plan}}',
                  })}
                </h3>
              </div>
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
                    t(
                      'creator.monetization.select_plan_start',
                      'Selecciona un plan para comenzar',
                    ),
                    'success',
                  );
                } else {
                  portalMutation.mutate();
                }
              }}
              className="min-h-11 px-5 shrink-0"
            >
              {t(
                'creator.monetization.manage_subscription',
                'Gestionar Suscripción',
              )}
            </Button>
          </motion.div>

          {/* Pricing Tiers Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans?.map((plan) => {
              const displayName =
                plan.name === 'Premium' ? 'Verified' : plan.name;
              const active = isTierActive(plan.name);
              return (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`p-5 rounded-xl border transition-colors flex flex-col justify-between space-y-5 ${
                    active
                      ? 'border-brand-primary/40 bg-brand-primary/10'
                      : 'border-white/5 glass-panel hover:bg-white/5'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                        {getTierIcon(plan.name)}
                      </div>
                      {active && (
                        <span className="px-2.5 py-0.5 rounded-lg bg-brand-primary/15 text-brand-primary text-[11px] font-medium">
                          {t('creator.monetization.active', 'Plan Activo')}
                        </span>
                      )}
                    </div>

                    <h4 className="text-lg font-bold text-white tracking-tight mb-1">
                      {displayName}
                    </h4>

                    <div className="flex items-baseline gap-1 mb-4">
                      <span className="text-2xl font-semibold text-white tabular-nums tracking-tight">
                        {((plan.priceCents ?? 0) / 100).toFixed(2)}
                        {plan.currency === 'EUR' ? '€' : plan.currency}
                      </span>
                      <span className="text-xs text-white/50">
                        {plan.interval === 'month'
                          ? t('creator.monetization.per_month', '/ mes')
                          : t('creator.monetization.per_year', '/ año')}
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
                            className="text-brand-primary shrink-0"
                          />
                          <span>{feature.replace(/_/g, ' ')}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {!active && (
                    <Button
                      variant="secondary"
                      disabled={checkoutMutation.isPending}
                      isLoading={checkoutMutation.isPending}
                      onClick={() => checkoutMutation.mutate(plan.id)}
                      className="w-full min-h-11"
                    >
                      {t('creator.monetization.upgrade_now', 'Mejorar Ahora')}
                    </Button>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Additional Features Teaser */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl glass-panel border border-white/5 flex items-start gap-3">
              <TrendingUp
                size={18}
                className="text-brand-primary shrink-0 mt-0.5"
                aria-hidden
              />
              <div>
                <h4 className="text-sm font-medium text-white mb-1">
                  {t(
                    'creator.monetization.growth_analytics',
                    'Analíticas de Crecimiento',
                  )}
                </h4>
                <p className="text-xs text-white/50 leading-relaxed">
                  {t(
                    'creator.monetization.growth_desc',
                    'Accede a métricas avanzadas de conversión y retención de fans.',
                  )}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl glass-panel border border-white/5 flex items-start gap-3">
              <Users
                size={18}
                className="text-brand-primary shrink-0 mt-0.5"
                aria-hidden
              />
              <div>
                <h4 className="text-sm font-medium text-white mb-1">
                  {t('creator.monetization.vip_community', 'Comunidad VIP')}
                </h4>
                <p className="text-xs text-white/50 leading-relaxed">
                  {t(
                    'creator.monetization.vip_desc',
                    'Crea canales directos y publicaciones exclusivas para tus fans VIP.',
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
