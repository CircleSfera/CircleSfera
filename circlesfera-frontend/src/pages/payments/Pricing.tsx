import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { EmptyState, ErrorState } from '../../components/ErrorEmptyStates';
import { LoadingSpinner } from '../../components/LoadingStates';
import {
  MarketingCTA,
  MarketingPage,
  MarketingPageHeader,
} from '../../components/marketing';
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
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const currentUser = useAuthStore((state) => state.profile);
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

  const {
    data: plans,
    isLoading,
    isError,
    refetch,
  } = useQuery<PlatformPlanDto[]>({
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
    onError: async (error: unknown) => {
      const axiosError = error as {
        response?: { status?: number; data?: { message?: string } };
      };
      const serverMessage = axiosError?.response?.data?.message;
      if (
        axiosError?.response?.status === 403 &&
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
                className="bg-brand-primary text-white text-xs font-bold py-2.5 min-h-11 px-3 rounded-lg mt-1 hover:bg-brand-primary/95 transition-all"
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
      navigate('/accounts/signup');
      return;
    }
    setLoadingPlanId(plan.id);
    checkoutMutation.mutate(plan);
  };

  const verificationLevel =
    currentUser?.user?.verificationLevel || currentUser?.verificationLevel;

  return (
    <MarketingPage>
      <div className="mx-auto max-w-6xl px-4 sm:px-5 py-8 sm:py-10 w-full">
        <MarketingPageHeader
          align="center"
          className="mb-8 sm:mb-10"
          eyebrow={t('pricingPage.badge')}
          title={
            <>
              {t('pricingPage.heading')}{' '}
              <span className="gradient-text bg-linear-to-r from-brand-secondary to-brand-primary">
                {t('pricingPage.heading_highlight')}
              </span>
            </>
          }
          description={t('pricingPage.subtitle')}
        />

        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : isError ? (
          <ErrorState
            title={t('pricingPage.checkout_error')}
            message={t('pricingPage.subtitle')}
            onRetry={() => refetch()}
          />
        ) : !plans?.length ? (
          <EmptyState
            title={t('pricingPage.badge')}
            message={t('pricingPage.subtitle')}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
            {plans.map((plan, index) => {
              const isPopular =
                plan.name.toLowerCase().includes('elite') ||
                index === Math.floor(plans.length / 2);
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
                <article
                  key={plan.id}
                  className={`rounded-xl border p-4 sm:p-5 flex flex-col glass-panel ${
                    isPopular
                      ? 'border-brand-primary/40 bg-brand-primary/8'
                      : 'border-white/10 bg-surface-raised/60'
                  }`}
                >
                  {isPopular && (
                    <span className="self-start mb-3 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-brand-primary text-white">
                      {t('pricingPage.most_popular')}
                    </span>
                  )}

                  <div className="mb-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                        {plan.name}
                      </h2>
                      {isActive && (
                        <span className="text-[10px] px-2 py-0.5 bg-brand-primary/20 text-brand-primary border border-brand-primary/30 rounded-md font-bold uppercase">
                          {t('pricingPage.current_plan')}
                        </span>
                      )}
                    </div>
                    <p className="flex items-baseline gap-1">
                      <span className="text-2xl sm:text-3xl font-black text-white">
                        {currencySymbol}
                        {plan.price}
                      </span>
                      <span className="text-white/35 text-sm">
                        /{plan.interval || 'month'}
                      </span>
                    </p>
                    <p className="text-sm text-white/50 mt-2 leading-relaxed">
                      {description}
                    </p>
                  </div>

                  <ul className="space-y-2.5 mb-5 grow">
                    {(plan.features || []).map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center shrink-0 mt-0.5">
                          <Check className="w-3 h-3 text-brand-primary" />
                        </span>
                        <span className="text-sm text-white/60">
                          {feature.replace(/_/g, ' ')}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <MarketingCTA
                    variant={isPopular ? 'primary' : 'secondary'}
                    className="w-full"
                    disabled={loadingPlanId !== null}
                    onClick={() => handleTierClick(plan)}
                  >
                    {loadingPlanId === plan.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isActive ? (
                      t('pricingPage.manage_subscription')
                    ) : (
                      buttonText
                    )}
                  </MarketingCTA>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </MarketingPage>
  );
}
