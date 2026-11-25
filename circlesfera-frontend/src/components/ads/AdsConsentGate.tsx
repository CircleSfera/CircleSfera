import { ADS_CONSENT_FLAG, type AdChoice } from '@circlesfera/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { isLegalPath } from '../../layouts/contentShell';
import {
  ADS_CONSENT_QUERY_KEY,
  adsConsentApi,
} from '../../services/adsConsent.service';
import { useAuthStore } from '../../stores/authStore';
import { apiErrorCode, apiErrorMessage } from '../../utils/apiErrorMessage';
import AdsConsentChoices from './AdsConsentChoices';

// Answers the server will not take from this app: texts that changed since
// it was built, or the screen switched off meanwhile. The screen then gets
// out of the way instead of blocking the app.
const CLOSES_THE_SCREEN = new Set([
  'AD_CONSENT_TEXT_OUTDATED',
  'FEATURE_DISABLED',
]);

/**
 * "How should your ads be chosen?" (PD-084): the step right after the Terms
 * at sign-up, and once, on the next open, for accounts that existed before.
 * Shown only when the server says so (askNow): never to someone under 18,
 * never again for 6 months after a "no", never to an app built with other
 * texts, and never while the ads_consent flag is off, which this also checks
 * before asking the server anything. The legal pages stay readable: the
 * screen is not drawn over them.
 */
export default function AdsConsentGate() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const flagOn = useFeatureFlag(ADS_CONSENT_FLAG);
  const { pathname } = useLocation();
  const [closed, setClosed] = useState(false);
  const enabled = !!isAuthenticated && flagOn;

  const { data } = useQuery({
    queryKey: ADS_CONSENT_QUERY_KEY,
    queryFn: adsConsentApi.status,
    enabled,
    retry: false,
    staleTime: 5 * 60_000,
  });

  if (!enabled || !data?.askNow || closed || isLegalPath(pathname)) {
    return null;
  }
  return <AdsConsentScreen onRefused={() => setClosed(true)} />;
}

function AdsConsentScreen({ onRefused }: { onRefused: () => void }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Tab and Shift+Tab stay inside the screen while it is open.
  const dialogRef = useFocusTrap<HTMLDivElement>(true);

  // The screen covers the app until one of the two is chosen: the page under
  // it does not scroll, and the reader starts at the title, not on either
  // answer, so neither looks chosen. (After the trap, which would focus the
  // first answer.)
  useEffect(() => {
    headingRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.removeProperty('overflow');
    };
  }, []);

  // From the title, Shift+Tab goes round to the last control of the screen,
  // not out of it.
  const onHeadingKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Tab' || !event.shiftKey) return;
    const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled])',
    );
    const last = controls?.[controls.length - 1];
    if (last) {
      event.preventDefault();
      last.focus();
    }
  };

  const answer = useMutation({
    mutationFn: (choice: AdChoice) =>
      adsConsentApi.answer(
        choice,
        'PROMPT',
        i18n.resolvedLanguage ?? i18n.language,
      ),
    onSuccess: async (status) => {
      // A status read still on its way was asked before this answer: it is
      // dropped, or it would bring the screen back when it lands.
      await queryClient.cancelQueries({ queryKey: ADS_CONSENT_QUERY_KEY });
      queryClient.setQueryData(ADS_CONSENT_QUERY_KEY, status);
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, t, 'adsConsent.save_error'));
      if (CLOSES_THE_SCREEN.has(apiErrorCode(error) ?? '')) onRefused();
    },
  });

  return (
    <div
      ref={dialogRef}
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
              onKeyDown={onHeadingKeyDown}
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
          {/* The policy opens as its own page, which this screen leaves
              uncovered; going back returns here. */}
          <Link
            to="/privacy"
            className="inline-flex items-center min-h-11 text-sm text-white/60 underline underline-offset-4 hover:text-white"
          >
            {t('adsConsent.privacy_policy')}
          </Link>
          <p className="sr-only" aria-live="polite">
            {answer.isPending ? t('adsConsent.saving') : ''}
          </p>
        </div>
      </div>
    </div>
  );
}
