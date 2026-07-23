import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { paymentsApi } from '../../services/payments.service';
import { usersApi } from '../../services/users.service';
import { useAuthStore } from '../../stores/authStore';
import type { PlatformPlanDto } from '../../types';
import { logger } from '../../utils/logger';

const planVerificationMap: Record<string, string> = {
  Premium: 'VERIFIED',
  'Elite Creator': 'ELITE',
  Elite: 'ELITE',
  Business: 'BUSINESS',
};

export default function Pricing() {
  const { t } = useTranslation();
  const { isAuthenticated, profile: currentUser } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);

  const planDescriptions: Record<string, string> = {
    Premium: t('pricingPage.desc_premium'),
    'Elite Creator': t('pricingPage.desc_elite'),
    Elite: t('pricingPage.desc_elite'),
    Business: t('pricingPage.desc_business'),
  };

  const planButtonText: Record<string, string> = {
    Premium: t('pricingPage.button_premium'),
    'Elite Creator': t('pricingPage.button_elite'),
    Elite: t('pricingPage.button_elite'),
    Business: t('pricingPage.button_business'),
  };

  useEffect(() => {
    if (!isAuthenticated || !currentUser || currentUser.identityVerifiedAt) {
      return;
    }
    usersApi
      .syncIdentitySession()
      .then((res) => {
        if (res?.status === 'verified') {
          queryClient.invalidateQueries({ queryKey: ['myProfile'] });
          toast.success(t('pricingPage.identity_verified'));
        }
      })
      .catch((err) => logger.error('Failed to sync identity session:', err));
  }, [isAuthenticated, currentUser, queryClient, t]);

  const { data: plans, isLoading } = useQuery<PlatformPlanDto[]>({
    queryKey: ['platform-plans'],
    queryFn: paymentsApi.getPlans,
  });

  const { data: billingStatus } = useQuery({
    queryKey: ['billingStatus'],
    queryFn: paymentsApi.getBillingStatus,
    enabled: isAuthenticated,
    retry: false,
  });

  const checkoutMutation = useMutation({
    mutationFn: async (plan: PlatformPlanDto) => {
      const verificationLevel =
        currentUser?.user?.verificationLevel || currentUser?.verificationLevel;
      const mappedLevel = planVerificationMap[plan.name];
      const isActiveByBilling =
        !!billingStatus?.hasActiveSubscription &&
        billingStatus?.subscription?.planName
          ?.toLowerCase()
          .includes(plan.name.toLowerCase());
      const isActiveByLevel =
        !!mappedLevel && verificationLevel === mappedLevel;
      const isActive = isActiveByBilling || isActiveByLevel;

      if (isActive) {
        return paymentsApi.getBillingPortalUrl();
      }

      return paymentsApi.createSubscriptionCheckout(plan.id);
    },
    onSuccess: (res) => {
      if (res?.url) {
        window.location.href = res.url;
      }
    },
    onError: async (error: any) => {
      const serverMessage = error?.response?.data?.message;
      if (
        error?.response?.status === 403 &&
        serverMessage?.includes('verificar')
      ) {
        toast(
          (toastItem) => (
            <div className="flex flex-col gap-2 p-1 text-left">
              <span className="font-bold text-sm text-zinc-900">
                {t('pricingPage.verification_required_title')}
              </span>
              <span className="text-xs text-zinc-600">
                {t('pricingPage.verification_required_desc')}
              </span>
              <button
                type="button"
                className="bg-brand-primary text-white text-xs font-bold py-2 px-3 rounded-lg mt-1 hover:bg-brand-primary/95 transition-all active:scale-95"
                onClick={async () => {
                  toast.dismiss(toastItem.id);
                  try {
                    const res = await usersApi.createIdentitySession(
                      window.location.href,
                    );
                    if (res.url) {
                      window.location.href = res.url;
                    }
                  } catch {
                    toast.error(t('pricingPage.verify_error'));
                  }
                }}
              >
                {t('pricingPage.verify_button')}
              </button>
            </div>
          ),
          { duration: 8000 },
        );
      } else {
        toast.error(t('pricingPage.checkout_error'));
      }
    },
    onSettled: () => setLoadingPlanId(null),
  });

  const handleTierClick = async (plan: PlatformPlanDto) => {
    if (!isAuthenticated) {
      navigate('/accounts/emailsignup');
      return;
    }
    setLoadingPlanId(plan.id);
    checkoutMutation.mutate(plan);
  };

  const verificationLevel =
    currentUser?.user?.verificationLevel || currentUser?.verificationLevel;

  return (
    <div className="pt-16 md:pt-24 pb-24 relative overflow-hidden flex flex-col items-center">
      <div className="w-full max-w-6xl px-4 md:px-6 relative z-10">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-bold uppercase tracking-wide text-brand-primary mb-4"
          >
            <Sparkles size={14} />
            {t('pricingPage.badge')}
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xl md:text-3xl font-black tracking-tighter mb-6 text-white"
          >
            {t('pricingPage.heading')}{' '}
            <span className="bg-clip-text text-transparent bg-linear-to-r from-brand-secondary to-brand-primary">
              {t('pricingPage.heading_highlight')}
            </span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-white/40 max-w-lg mx-auto font-light"
          >
            {t('pricingPage.subtitle')}
          </motion.p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {(plans || []).map((plan, index) => {
              const isPopular =
                plan.name.toLowerCase().includes('elite') ||
                index === Math.floor((plans?.length || 1) / 2);
              const mappedLevel = planVerificationMap[plan.name];
              const isActiveByBilling =
                !!billingStatus?.hasActiveSubscription &&
                billingStatus?.subscription?.planName
                  ?.toLowerCase()
                  .includes(plan.name.toLowerCase());
              const isActive =
                isActiveByBilling ||
                (!!mappedLevel && verificationLevel === mappedLevel);
              const currencySymbol = plan.currency === 'EUR' ? '€' : '$';
              const description =
                plan.description ||
                planDescriptions[plan.name] ||
                t('pricingPage.default_description');
              const buttonText =
                planButtonText[plan.name] ||
                t('pricingPage.default_button', { plan: plan.name });

              return (
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  key={plan.id}
                  className={`glass-panel rounded-xl p-8 border transition-all duration-500 flex flex-col relative group hover:-translate-y-2 ${
                    isPopular
                      ? 'border-brand-primary/40 bg-white/5 ring-1 ring-brand-primary/20 scale-105 z-20'
                      : 'border-white/5 hover:border-white/10'
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-brand-primary rounded-full text-xs font-black tracking-wide uppercase shadow-xl shadow-brand-primary/20 text-white">
                      {t('pricingPage.most_popular')}
                    </div>
                  )}

                  <div className="mb-8">
                    <h3 className="text-xl font-black tracking-tight mb-2 text-white">
                      {plan.name}
                    </h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-white">
                        {currencySymbol}
                        {plan.price}
                      </span>
                      <span className="text-white/30 text-sm">
                        /{plan.interval || 'month'}
                      </span>
                      {isActive && (
                        <span className="ml-auto text-xs px-2.5 py-1 bg-brand-primary/20 text-brand-primary border border-brand-primary/30 rounded-full font-bold uppercase tracking-wider">
                          {t('pricingPage.current_plan')}
                        </span>
                      )}
                    </div>
                    <p className="text-white/40 text-sm mt-4 font-light italic leading-relaxed">
                      "{description}"
                    </p>
                  </div>

                  <div className="space-y-4 mb-10 grow">
                    {(plan.features || []).map((feature) => (
                      <div key={feature} className="flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-brand-primary/20 transition-colors">
                          <Check className="w-3 h-3 text-brand-primary" />
                        </div>
                        <span className="text-sm text-white/60 font-medium tracking-tight">
                          {feature.replace(/_/g, ' ')}
                        </span>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleTierClick(plan)}
                    disabled={loadingPlanId !== null}
                    className={`w-full py-4 rounded-lg font-black text-sm tracking-tighter transition-all duration-300 transform active:scale-95 flex items-center justify-center gap-2 ${
                      isPopular
                        ? 'bg-linear-to-r from-brand-secondary via-brand-primary to-brand-blue text-white shadow-lg shadow-brand-primary/20 hover:shadow-brand-primary/40'
                        : 'bg-white/5 text-white hover:bg-white/10 border border-white/10 hover:border-white/20'
                    }`}
                  >
                    {loadingPlanId === plan.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : isActive ? (
                      t('pricingPage.manage_subscription')
                    ) : (
                      buttonText
                    )}
                  </button>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Background Accent */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-200 h-200 bg-brand-primary/5 rounded-full blur-[150px] pointer-events-none" />
    </div>
  );
}
