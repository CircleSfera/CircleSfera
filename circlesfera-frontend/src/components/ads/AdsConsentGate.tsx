import { ADS_CONSENT_FLAG, type AdChoice } from '@circlesfera/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import {
  ADS_CONSENT_QUERY_KEY,
  adsConsentApi,
} from '../../services/adsConsent.service';
import { useAuthStore } from '../../stores/authStore';
import { apiErrorMessage } from '../../utils/apiErrorMessage';
import AdsConsentChoices from './AdsConsentChoices';

/**
 * "How should your ads be chosen?" (PD-084): the step right after the Terms
 * at sign-up, and once, on the next open, for accounts that existed before.
 * Shown only when the server says so (askNow): never to someone under 18,
 * never again for 6 months after a "no", and never while the ads_consent
 * flag is off, which this also checks before asking the server anything.
 */
export default function AdsConsentGate() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const flagOn = useFeatureFlag(ADS_CONSENT_FLAG);
  const enabled = !!isAuthenticated && flagOn;

  const { data } = useQuery({
    queryKey: ADS_CONSENT_QUERY_KEY,
    queryFn: adsConsentApi.status,
    enabled,
    retry: false,
    staleTime: 5 * 60_000,
  });

  if (!enabled || !data?.askNow) return null;
  return <AdsConsentScreen />;
}

function AdsConsentScreen() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The screen covers the app until one of the two is chosen: the page under
  // it does not scroll, and the reader starts at the title, not on either
  // answer, so neither looks chosen.
  useEffect(() => {
    headingRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.removeProperty('overflow');
    };
  }, []);

  const answer = useMutation({
    mutationFn: (choice: AdChoice) =>
      adsConsentApi.answer(
        choice,
        'PROMPT',
        i18n.resolvedLanguage ?? i18n.language,
      ),
    onSuccess: (status) => {
      queryClient.setQueryData(ADS_CONSENT_QUERY_KEY, status);
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, t, 'adsConsent.save_error'));
    },
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ads-consent-title"
      aria-describedby="ads-consent-text"
      data-testid="ads-consent-screen"
      className="fixed inset-0 z-210 overflow-y-auto bg-surface-base"
    >
      <div className="min-h-full flex flex-col justify-center px-4 py-8 pt-[calc(2rem+env(safe-area-inset-top,0px))] pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
        <div className="mx-auto w-full max-w-md md:max-w-3xl">
          <div className="max-w-md">
            <h1
              id="ads-consent-title"
              ref={headingRef}
              tabIndex={-1}
              className="text-2xl font-semibold text-white tracking-tight outline-none"
            >
              {t('adsConsent.title')}
            </h1>
            <p
              id="ads-consent-text"
              className="mt-3 text-base text-white/70 leading-relaxed"
            >
              {t('adsConsent.text')}
            </p>
          </div>
          <div className="mt-8">
            <AdsConsentChoices
              onChoose={(choice) => answer.mutate(choice)}
              disabled={answer.isPending}
            />
          </div>
          <p className="sr-only" aria-live="polite">
            {answer.isPending ? t('adsConsent.saving') : ''}
          </p>
        </div>
      </div>
    </div>
  );
}
