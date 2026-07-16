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
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export default function CreatorMonetizationTab({ onToast }: Props) {
  const { t } = useTranslation();
  const { profile } = useAuthStore();
  const user = profile?.user;

  const currentLevel = user?.verificationLevel || 'BASIC';

  const { data: plans, isLoading: isLoadingPlans } = useQuery<
    PlatformPlanDto[]
  >({
    queryKey: ['platform-plans'],
    queryFn: paymentsApi.getPlans,
  });

  const { data: monetizationStatus, isLoading: isLoadingMonetization } =
    useQuery({
      queryKey: ['monetization-status'],
      queryFn: monetizationApi.getStatus,
    });

  const connectMutation = useMutation({
    mutationFn: () => {
      const returnUrl = window.location.href;
      return monetizationApi.connectAccount(returnUrl, returnUrl);
    },
    onSuccess: (data: any) => {
      window.location.href = data.url;
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
    if (lower.includes('premium')) return <Star className="text-brand-blue" />;
    if (lower.includes('elite'))
      return <Award className="text-brand-primary" />;
    if (lower.includes('business'))
      return <Shield className="text-brand-accent" />;
    return <Zap className="text-brand-primary" />;
  };

  const isTierActive = (planName: string) => {
    const lower = planName.toLowerCase();
    if (lower.includes('premium')) return currentLevel === 'VERIFIED';
    if (lower.includes('elite')) return currentLevel === 'ELITE';
    if (lower.includes('business')) return currentLevel === 'BUSINESS';
    return false;
  };

  if (isLoadingPlans || isLoadingMonetization) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="animate-spin text-brand-primary" size={40} />
        <p className="text-zinc-500 font-bold uppercase tracking-wide text-xs">
          {t('creator.monetization.loading_plans')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-20">
      {/* 1. Direct Earnings (Stripe Connect) OR Creator Sandbox */}
      {monetizationStatus?.hasStripeAccount ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-8 glass-panel rounded-lg border border-white/5 bg-linear-to-br from-emerald-500/10 via-transparent to-transparent relative overflow-hidden"
        >
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <Wallet size={20} className="text-emerald-400" />
              </div>
              <h3 className="text-sm font-black text-white uppercase tracking-wide italic">
                Ganancias Directas (Stripe)
              </h3>
            </div>

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
              <div>
                <p className="text-zinc-500 text-xs font-black uppercase tracking-wide mb-2">
                  Ingresos Totales (Lifetime)
                </p>
                <h2 className="text-2xl font-bold text-white tracking-tight uppercase">
                  $
                  {(
                    (monetizationStatus?.lifetimeEarningsCents || 0) / 100
                  ).toFixed(2)}
                </h2>
              </div>

              <Button
                variant="secondary"
                disabled={dashboardMutation.isPending}
                onClick={() => dashboardMutation.mutate()}
                isLoading={dashboardMutation.isPending}
                className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-500/30"
              >
                Ver Express Dashboard
                <ExternalLink size={14} className="ml-2" />
              </Button>
            </div>
          </div>

          <div className="absolute top-0 right-0 p-10 opacity-5">
            <Wallet size={200} className="text-emerald-400" />
          </div>
        </motion.div>
      ) : (
        <CreatorSandbox
          isConnecting={connectMutation.isPending}
          onConnect={() => connectMutation.mutate()}
        />
      )}

      {/* 2. Platform Subscriptions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-8 glass-panel rounded-lg border border-white/5 bg-linear-to-br from-brand-primary/10 via-transparent to-transparent relative overflow-hidden"
      >
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-brand-primary/20 flex items-center justify-center">
              <Zap size={20} className="text-brand-primary" />
            </div>
            <h3 className="text-sm font-black text-white uppercase tracking-wide italic">
              {t('creator.monetization.subscription_status')}
            </h3>
          </div>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
            <div>
              <p className="text-zinc-500 text-xs font-black uppercase tracking-wide mb-2">
                {t('creator.monetization.current_plan')}
              </p>
              <h2 className="text-xl font-bold text-white tracking-tight uppercase">
                {currentLevel === 'BASIC' ? 'Free Experience' : currentLevel}
              </h2>
            </div>
            <Button
              variant="primary"
              disabled={portalMutation.isPending}
              isLoading={portalMutation.isPending}
              onClick={() => {
                if (currentLevel === 'BASIC') {
                  onToast(
                    t('creator.monetization.select_plan_start'),
                    'success',
                  );
                } else {
                  portalMutation.mutate();
                }
              }}
              className="px-8 bg-white text-black hover:bg-white/90"
            >
              {t('creator.monetization.manage_subscription')}
            </Button>
          </div>
        </div>

        <div className="absolute top-0 right-0 p-10 opacity-5">
          <Zap size={200} className="text-brand-primary" />
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans?.map((plan) => {
          const displayName = plan.name === 'Premium' ? 'Verified' : plan.name;
          const active = isTierActive(plan.name);
          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`p-6 glass-panel rounded-lg border ${
                active
                  ? 'border-brand-primary/40 bg-brand-primary/5 shadow-xl shadow-brand-primary/10'
                  : 'border-white/5 hover:border-white/20 hover:bg-white/5'
              } transition-all group flex flex-col`}
            >
              <div className="flex items-center justify-between mb-6">
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                  {getTierIcon(plan.name)}
                </div>
                {active && (
                  <span className="px-3 py-1 rounded-full bg-brand-primary text-xs font-black uppercase tracking-wide text-white shadow-lg shadow-brand-primary/20">
                    {t('creator.monetization.active')}
                  </span>
                )}
              </div>

              <div className="mb-6">
                <h4 className="text-lg font-bold text-white mb-1 tracking-tight">
                  {displayName}
                </h4>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-white tracking-tighter">
                    {plan.price}
                    {plan.currency === 'EUR' ? '€' : plan.currency}
                  </span>
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-wide">
                    {plan.interval === 'month'
                      ? t('creator.monetization.per_month')
                      : t('creator.monetization.per_year')}
                  </span>
                </div>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature: string) => (
                  <li
                    key={feature}
                    className="flex items-center gap-2.5 text-xs font-bold text-zinc-500 uppercase tracking-wide"
                  >
                    <CheckCircle2 size={14} className="text-brand-primary" />
                    {feature.replace(/_/g, ' ')}
                  </li>
                ))}
              </ul>

              {!active && (
                <Button
                  variant="secondary"
                  disabled={checkoutMutation.isPending}
                  isLoading={checkoutMutation.isPending}
                  onClick={() => checkoutMutation.mutate(plan.id)}
                  className="w-full bg-white/5 border-white/10 hover:bg-white hover:text-black"
                >
                  {t('creator.monetization.upgrade_now')}
                </Button>
              )}
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="p-6 glass-panel rounded-lg border border-white/5 relative overflow-hidden group">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
              <TrendingUp size={20} className="text-indigo-400" />
            </div>
            <h3 className="text-white font-black uppercase text-xs tracking-wide">
              {t('creator.monetization.growth_analytics')}
            </h3>
          </div>
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-wide leading-relaxed italic">
            {t('creator.monetization.growth_desc')}
          </p>
        </div>

        <div className="p-6 glass-panel rounded-lg border border-white/5 relative overflow-hidden group">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
              <Users size={20} className="text-emerald-400" />
            </div>
            <h3 className="text-white font-black uppercase text-xs tracking-wide">
              {t('creator.monetization.vip_community')}
            </h3>
          </div>
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-wide leading-relaxed italic">
            {t('creator.monetization.vip_desc')}
          </p>
        </div>
      </div>
    </div>
  );
}
