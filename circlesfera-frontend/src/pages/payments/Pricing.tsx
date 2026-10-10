import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Eye,
  LifeBuoy,
  Loader2,
  Settings,
  ShieldCheck,
} from 'lucide-react';
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
import { ArticleLinks } from '../../components/support/ArticleLinks';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { helpCentreApi } from '../../services/helpCentre.service';
import { paymentsApi } from '../../services/payments.service';
import { usersApi } from '../../services/users.service';
import { useAuthStore } from '../../stores/authStore';
import type { PlatformPlanDto } from '../../types';
import { reportPaymentError } from '../../utils/identityVerification';
import { logger } from '../../utils/logger';
import { formatCents } from '../../utils/money';
import { planFeatureLabel } from '../../utils/planFeatures';

// The articles of the help centre that answer what is asked before paying.
const PRICING_ARTICLES = [
  'is-circlesfera-free',
  'what-plans-unlock',
  'identity-verification',
];

// Each one is asked for by its address: the list of the help centre holds
// only its first articles, and these must not depend on being among them.
// Shows nothing when the help centre does not answer: the link to all the
// questions below it stays.
function PricingQuestions() {
  const { i18n } = useTranslation();
  const { data: questions = [] } = useQuery({
    queryKey: ['help', 'pricing-articles', i18n.language],
    queryFn: async () => {
      const found = await Promise.all(
        PRICING_ARTICLES.map((slug) =>
          helpCentreApi
            .article(slug, i18n.language)
            .then((res) => res.data)
            // One that is missing or unpublished leaves the others.
            .catch(() => null),
        ),
      );
      return found.flatMap((article) => (article ? [article] : []));
    },
    retry: false,
  });
  if (questions.length === 0) return null;
  return (
    <div className="mt-6">
      <ArticleLinks articles={questions} />
    </div>
  );
}

// Plan name → verification level it grants. "Verified" is the old name of
// the €9.99 plan, now "Premium".
const planVerificationMap: Record<string, string> = {
  Premium: 'VERIFIED',
  Verified: 'VERIFIED',
  'Elite Creator': 'ELITE',
  Elite: 'ELITE',
  Business: 'BUSINESS',
};

const ASSURANCES = [
  { key: 'secure', icon: ShieldCheck },
  { key: 'upfront', icon: Eye },
  { key: 'manage', icon: Settings },
  { key: 'support', icon: LifeBuoy },
] as const;

export default function Pricing() {
  const { t, i18n } = useTranslation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const currentUser = useAuthStore((state) => state.profile);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'YEARLY'>(
    'MONTHLY',
  );

  const planDescriptions: Record<string, string> = {
    Premium: t('pricingPage.desc_premium'),
    Verified: t('pricingPage.desc_premium'),
    'Elite Creator': t('pricingPage.desc_elite'),
    Elite: t('pricingPage.desc_elite'),
    Business: t('pricingPage.desc_business'),
  };

  const planButtonText: Record<string, string> = {
    Premium: t('pricingPage.button_premium'),
    Verified: t('pricingPage.button_premium'),
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
        currentUser?.verificationLevel || currentUser?.verificationLevel;
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

      return paymentsApi.createSubscriptionCheckout(plan.id, billingCycle);
    },
    onSuccess: (res) => {
      if (res?.url) {
        window.location.href = res.url;
      }
    },
    onError: (error: unknown) =>
      reportPaymentError(error, t, 'pricingPage.checkout_error'),
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
    currentUser?.verificationLevel || currentUser?.verificationLevel;

  const hasYearlyPlans =
    plans?.some((p) => p.yearlyPriceCents != null && p.yearlyPriceCents > 0) ??
    false;

  return (
    <MarketingPage withFooter={!isAuthenticated}>
      <div className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6 sm:pb-20">
        <MarketingPageHeader
          align="center"
          className="pt-12 pb-8 sm:pt-20 sm:pb-10"
          eyebrow={t('pricingPage.badge')}
          title={
            <>
              <span className="block">{t('pricingPage.heading')}</span>{' '}
              <span className="block bg-linear-to-r from-brand-secondary via-brand-primary to-brand-blue bg-clip-text text-transparent">
                {t('pricingPage.heading_highlight')}
              </span>
            </>
          }
          description={t('pricingPage.subtitle')}
        />

        {hasYearlyPlans && !isLoading && !isError && (
          <div className="mb-8 flex justify-center">
            <SegmentedControl
              id="billingCyclePill"
              label={t('pricingPage.billing_cycle_label')}
              value={billingCycle}
              onChange={setBillingCycle}
              items={[
                { value: 'MONTHLY', label: t('pricingPage.billing_monthly') },
                { value: 'YEARLY', label: t('pricingPage.billing_yearly') },
              ]}
            />
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : isError ? (
          <ErrorState
            title={t('pricingPage.load_error_title')}
            message={t('pricingPage.load_error_message')}
            onRetry={() => refetch()}
          />
        ) : !plans?.length ? (
          <EmptyState
            title={t('pricingPage.badge')}
            message={t('pricingPage.subtitle')}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
              const monthlyCents = plan.priceCents ?? 0;
              const yearlyCents = plan.yearlyPriceCents ?? 0;
              const showYearly = billingCycle === 'YEARLY' && yearlyCents > 0;
              const displayCents = showYearly ? yearlyCents : monthlyCents;
              // The plan stores its interval in English ("month"): the two
              // known ones are said in the reader's language, any other is
              // shown as stored, never as a month.
              const intervalLabel =
                showYearly || plan.interval === 'year'
                  ? t('pricingPage.per_year')
                  : !plan.interval || plan.interval === 'month'
                    ? t('pricingPage.per_month')
                    : plan.interval;
              const yearlySavingsPercent =
                showYearly && monthlyCents > 0
                  ? Math.round((1 - yearlyCents / (monthlyCents * 12)) * 100)
                  : 0;
              // The plan's own description is stored in one language; a
              // known plan uses the text of the catalog.
              const description =
                planDescriptions[plan.name] ||
                plan.description ||
                t('pricingPage.default_description');
              const buttonText =
                planButtonText[plan.name] ||
                t('pricingPage.default_button', { plan: plan.name });

              return (
                <article
                  key={plan.id}
                  className={`relative flex flex-col rounded-3xl border p-6 ${
                    isPopular
                      ? 'border-brand-primary/60 bg-brand-primary/10 shadow-[0_0_48px_-12px_rgba(var(--brand-primary-rgb),0.6)]'
                      : 'glass-panel'
                  }`}
                >
                  {isPopular && (
                    <span className="absolute -top-3 left-6 rounded-full bg-brand-primary px-3 py-1 text-xs font-bold text-white">
                      {t('pricingPage.most_popular')}
                    </span>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-xl font-black tracking-tight text-white">
                      {plan.name}
                    </h2>
                    {isActive && (
                      <span className="rounded-full border border-brand-primary/30 bg-brand-primary/20 px-2.5 py-1 text-xs font-bold text-brand-primary">
                        {t('pricingPage.current_plan')}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 min-h-12 text-sm leading-relaxed text-white/60">
                    {description}
                  </p>
                  <p className="mt-5 flex flex-wrap items-baseline gap-x-1.5 gap-y-2">
                    <span className="text-4xl font-black tracking-tight text-white">
                      {formatCents(
                        displayCents,
                        i18n.language,
                        plan.currency || 'EUR',
                      )}
                    </span>
                    <span className="text-sm text-white/60">
                      /{intervalLabel}
                    </span>
                    {showYearly && yearlySavingsPercent > 0 && (
                      <span className="rounded-full border border-emerald-500/25 bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-400">
                        {t('pricingPage.save_percent', {
                          percent: yearlySavingsPercent,
                        })}
                      </span>
                    )}
                  </p>

                  <ul className="mt-6 grow space-y-3 border-t border-white/8 pt-6">
                    {(plan.features || []).map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-primary/20">
                          <Check className="h-3 w-3 text-brand-primary" />
                        </span>
                        <span className="text-sm text-white/70">
                          {planFeatureLabel(feature, t)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <MarketingCTA
                    variant={isPopular ? 'primary' : 'secondary'}
                    size="lg"
                    className="mt-6 w-full"
                    disabled={
                      loadingPlanId !== null ||
                      (billingCycle === 'YEARLY' && yearlyCents <= 0)
                    }
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

        {/* What holds for every plan */}
        <ul className="mt-10 grid gap-4 sm:mt-14 md:grid-cols-2">
          {ASSURANCES.map(({ key, icon: Icon }) => (
            <li
              key={key}
              className="flex items-start gap-4 rounded-3xl glass-panel p-6"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-primary/15 text-brand-primary">
                <Icon size={22} strokeWidth={1.75} aria-hidden />
              </span>
              <span>
                <span className="block text-lg font-bold tracking-tight text-white">
                  {t(`pricingPage.assurances.${key}_title`)}
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-white/60">
                  {t(`pricingPage.assurances.${key}_desc`)}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <section className="mx-auto mt-10 max-w-3xl sm:mt-14">
          <h2 className="text-center text-3xl font-black leading-[1.08] tracking-tight text-white sm:text-4xl">
            {t('landing.faq.title')}
          </h2>
          <PricingQuestions />
          <div className="mt-6 flex justify-center">
            <MarketingCTA to="/help" variant="secondary" size="lg">
              {t('pricingPage.all_questions')}
            </MarketingCTA>
          </div>
        </section>
      </div>
    </MarketingPage>
  );
}
