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
import { useTranslation } from 'react-i18next';
import { monetizationApi } from '../../services/monetization.service';
import { paymentsApi } from '../../services/payments.service';
import { useAuthStore } from '../../stores/authStore';
import type { PlatformPlanDto } from '../../types';
import { Button } from '../ui';
import CreatorSandbox from './CreatorSandbox';

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
  const profile = useAuthStore((state) => state.profile);
  const user = profile?.user;

  const currentLevel = user?.verificationLevel || 'BASIC';

  const { data: plans, isLoading: isLoadingPlans } = useQuery<
    PlatformPlanDto[]
  >({
    queryKey: ['platform-plans'],
    queryFn: paymentsApi.getPlans,
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

  if (isLoadingPlans || isLoadingMonetization) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="animate-spin text-brand-primary" size={32} />
        <p className="text-gray-400 font-semibold text-xs uppercase tracking-wider">
          {t(
            'creator.monetization.loading_plans',
            'Cargando opciones de monetización...',
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {showIncome &&
        (hasStripeAccount ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-5 sm:p-6 rounded-2xl border border-white/8 bg-zinc-950/80 backdrop-blur-xl shadow-xl relative overflow-hidden space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
                <Wallet size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  Cuenta Stripe Conectada
                </h3>
                <p className="text-xs text-gray-400">
                  Tus pagos y transferencias directas se gestionan de forma
                  segura.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-white/3 border border-white/6">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Ingresos Totales (Lifetime)
                </span>
                <p className="text-2xl font-black text-white font-mono mt-0.5">
                  $
                  {((monetization?.lifetimeEarningsCents || 0) / 100).toFixed(
                    2,
                  )}{' '}
                  <span className="text-xs font-bold text-gray-400">USD</span>
                </p>
                {connectStatus && (
                  <span className="inline-block mt-1 text-[11px] font-medium text-emerald-400">
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
                className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 text-xs font-bold min-h-11 px-4"
              >
                Dashboard Express
                <ExternalLink size={14} className="ml-1.5" />
              </Button>
            </div>
          </motion.div>
        ) : (
          <CreatorSandbox
            isConnecting={connectMutation.isPending}
            onConnect={() => connectMutation.mutate()}
          />
        ))}

      {showPlans && (
        <div className="space-y-6">
          {/* Subscription Status Header */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-5 sm:p-6 rounded-2xl border border-white/8 bg-zinc-950/80 backdrop-blur-xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-primary/15 border border-brand-primary/25 flex items-center justify-center text-brand-primary shrink-0">
                <Zap size={20} />
              </div>
              <div>
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  {t(
                    'creator.monetization.subscription_status',
                    'Estatus de Suscripción',
                  )}
                </span>
                <h3 className="text-lg font-extrabold text-white tracking-tight uppercase">
                  Plan Actual: {currentPlanLabel}
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
              className="min-h-11 px-5 text-xs font-bold uppercase tracking-wider bg-white text-black hover:bg-gray-100 shrink-0"
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
                  className={`p-5 rounded-2xl border backdrop-blur-xl transition-all flex flex-col justify-between space-y-5 ${
                    active
                      ? 'border-brand-primary/50 bg-brand-primary/10 shadow-lg shadow-brand-primary/10'
                      : 'border-white/8 bg-zinc-950/80 hover:border-white/20'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                        {getTierIcon(plan.name)}
                      </div>
                      {active && (
                        <span className="px-2.5 py-0.5 rounded-full bg-brand-primary text-white text-[10px] font-bold uppercase tracking-wider shadow-md">
                          {t('creator.monetization.active', 'Plan Activo')}
                        </span>
                      )}
                    </div>

                    <h4 className="text-lg font-bold text-white tracking-tight mb-1">
                      {displayName}
                    </h4>

                    <div className="flex items-baseline gap-1 mb-4">
                      <span className="text-2xl font-black text-white font-mono tracking-tight">
                        {plan.price}
                        {plan.currency === 'EUR' ? '€' : plan.currency}
                      </span>
                      <span className="text-xs font-semibold text-gray-400 uppercase">
                        {plan.interval === 'month'
                          ? t('creator.monetization.per_month', '/ mes')
                          : t('creator.monetization.per_year', '/ año')}
                      </span>
                    </div>

                    <ul className="space-y-2 pt-3 border-t border-white/6">
                      {plan.features.map((feature: string) => (
                        <li
                          key={feature}
                          className="flex items-center gap-2 text-xs text-gray-300 font-medium"
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
                      className="w-full min-h-11 bg-white/6 border border-white/10 hover:bg-white hover:text-black text-xs font-bold uppercase tracking-wider transition-colors"
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
            <div className="p-4 sm:p-5 rounded-2xl bg-zinc-950/80 border border-white/8 backdrop-blur-xl flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-400 shrink-0">
                <TrendingUp size={18} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-1">
                  {t(
                    'creator.monetization.growth_analytics',
                    'Analíticas de Crecimiento',
                  )}
                </h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  {t(
                    'creator.monetization.growth_desc',
                    'Accede a métricas avanzadas de conversión y retención de fans.',
                  )}
                </p>
              </div>
            </div>

            <div className="p-4 sm:p-5 rounded-2xl bg-zinc-950/80 border border-white/8 backdrop-blur-xl flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shrink-0">
                <Users size={18} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-1">
                  {t('creator.monetization.vip_community', 'Comunidad VIP')}
                </h4>
                <p className="text-xs text-gray-400 leading-relaxed">
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
