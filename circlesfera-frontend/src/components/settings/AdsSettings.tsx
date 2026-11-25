import type { AdChoice } from '@circlesfera/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  ADS_CONSENT_QUERY_KEY,
  adsConsentApi,
} from '../../services/adsConsent.service';
import { apiErrorMessage } from '../../utils/apiErrorMessage';
import AdsConsentChoices from '../ads/AdsConsentChoices';
import { ErrorState } from '../ErrorEmptyStates';

/**
 * Settings → Ads (PD-084): the answer in force, and the same two answers as
 * the first screen to change it at any time. Withdrawing is one tap, as
 * giving was. Someone under 18 gets general ads only and is not offered the
 * other answer; an account with no date of birth is told that is why, and
 * where to add one.
 */
export default function AdsSettings() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const language = i18n.resolvedLanguage ?? i18n.language;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ADS_CONSENT_QUERY_KEY,
    queryFn: adsConsentApi.status,
    retry: false,
  });

  const answer = useMutation({
    mutationFn: (choice: AdChoice) =>
      adsConsentApi.answer(choice, 'SETTINGS', language),
    onSuccess: async (status) => {
      // A status read still on its way was asked before this answer: it is
      // dropped, or it would show the old answer when it lands.
      await queryClient.cancelQueries({ queryKey: ADS_CONSENT_QUERY_KEY });
      queryClient.setQueryData(ADS_CONSENT_QUERY_KEY, status);
      toast.success(t('adsConsent.settings.saved'));
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, t, 'adsConsent.save_error'));
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <ErrorState
        message={t('adsConsent.settings.load_error')}
        onRetry={() => void refetch()}
      />
    );
  }

  // The answer shown as chosen is the one that applies: an answer to texts
  // no longer in force does not, and is asked again.
  const current =
    data.textVersion === data.currentTextVersion ? data.choice : null;
  const choiceLabel = (choice: AdChoice) =>
    t(
      choice === 'PERSONALISED'
        ? 'adsConsent.personalised.label'
        : 'adsConsent.general.label',
    );

  return (
    <div className="max-w-3xl space-y-4">
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white tracking-tight">
          {t('adsConsent.settings.title')}
        </h2>
        {data.personalisationAllowed ? (
          <p className="text-sm text-white/65 leading-relaxed max-w-xl">
            {t('adsConsent.text')}
          </p>
        ) : null}
      </section>

      {data.personalisationAllowed ? (
        <>
          <div
            className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm"
            data-testid="ads-consent-current"
          >
            {current ? (
              <>
                <p className="font-medium text-white">
                  {t('adsConsent.settings.current', {
                    choice: choiceLabel(current),
                  })}
                </p>
                {data.decidedAt ? (
                  <p className="mt-1 text-white/55">
                    {t('adsConsent.settings.since', {
                      date: new Date(data.decidedAt).toLocaleDateString(
                        language,
                        { day: 'numeric', month: 'long', year: 'numeric' },
                      ),
                    })}
                  </p>
                ) : null}
                <p className="mt-1 text-white/55">
                  {t('adsConsent.settings.change_hint')}
                </p>
              </>
            ) : (
              <p className="text-white/75">{t('adsConsent.settings.none')}</p>
            )}
          </div>
          <AdsConsentChoices
            selected={current}
            onChoose={(choice) => {
              if (choice !== current) answer.mutate(choice);
            }}
            disabled={answer.isPending}
          />
        </>
      ) : data.dateOfBirthMissing ? (
        // Not known to be 18: the account has no date of birth. Verifying the
        // identity (Settings → Account) reads it from the document.
        <div
          className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/75 space-y-2"
          data-testid="ads-consent-no-birth-date"
        >
          <p>{t('adsConsent.settings.no_birth_date')}</p>
          <Link
            to="/accounts/account"
            className="inline-flex items-center min-h-11 font-medium text-brand-primary-text underline underline-offset-4"
          >
            {t('adsConsent.settings.add_birth_date')}
          </Link>
        </div>
      ) : (
        <p
          className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/75"
          data-testid="ads-consent-minor"
        >
          {t('adsConsent.settings.minor')}
        </p>
      )}
    </div>
  );
}
