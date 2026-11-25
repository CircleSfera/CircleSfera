import {
  AD_INTEREST_TOPICS,
  AD_INTERESTS_FLAG,
  type AdInterestsStatus,
  type AdInterestTopic,
} from '@circlesfera/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  AD_INTERESTS_QUERY_KEY,
  adInterestsApi,
} from '../../services/adInterests.service';
import { useExperimentStore } from '../../stores/useExperimentStore';
import { apiErrorMessage } from '../../utils/apiErrorMessage';
import { ErrorState } from '../ErrorEmptyStates';
import { Button } from '../ui';
import { BUTTON_PAIR } from '../ui/buttonWidth';

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((topic) => b.includes(topic));

const inListOrder = (topics: readonly string[]) =>
  AD_INTEREST_TOPICS.filter((topic) => topics.includes(topic));

/**
 * Settings → Ads → Your interests (PD-084): the topics the person chooses
 * for their ads, all of them visible, each one a chip they turn on or off,
 * up to the most. Only what they choose counts: nothing is worked out from
 * what they do. Not there while the ads flag is off, as Settings → Ads is
 * not. The server checks the set and the age again; this only shows it.
 */
export default function AdInterests() {
  const flagOn = useExperimentStore(
    (state) => state.flags[AD_INTERESTS_FLAG] === true,
  );
  return flagOn ? <AdInterestsSection /> : null;
}

function AdInterestsSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // What the person has turned on and not saved yet; null while it is what
  // is stored.
  const [draft, setDraft] = useState<AdInterestTopic[] | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: AD_INTERESTS_QUERY_KEY,
    queryFn: adInterestsApi.status,
    retry: false,
  });

  const choose = useMutation({
    mutationFn: (topics: AdInterestTopic[]) => adInterestsApi.choose(topics),
    onSuccess: async (status: AdInterestsStatus) => {
      // A read still on its way was asked before this answer: it is dropped,
      // or it would show the old interests when it lands.
      await queryClient.cancelQueries({ queryKey: AD_INTERESTS_QUERY_KEY });
      queryClient.setQueryData(AD_INTERESTS_QUERY_KEY, status);
      setDraft(null);
      toast.success(
        t(
          status.interests.length > 0
            ? 'adInterests.saved'
            : 'adInterests.cleared',
        ),
      );
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, t, 'adInterests.save_error'));
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
        message={t('adInterests.load_error')}
        onRetry={() => void refetch()}
      />
    );
  }

  const chosen = draft ?? data.interests;
  const max = data.maxInterests;
  const full = chosen.length >= max;
  const changed = !sameSet(chosen, data.interests);
  const busy = choose.isPending;

  const toggle = (topic: AdInterestTopic) => {
    if (chosen.includes(topic)) {
      setDraft(chosen.filter((other) => other !== topic));
    } else if (!full) {
      setDraft(inListOrder([...chosen, topic]));
    }
  };

  const clearAll = (
    <Button
      type="button"
      variant="outline"
      onClick={() => choose.mutate([])}
      disabled={busy || data.interests.length === 0}
      data-testid="ad-interests-clear"
    >
      {t('adInterests.clear_all')}
    </Button>
  );

  return (
    <section
      className="max-w-3xl space-y-4"
      aria-labelledby="ad-interests-title"
      data-testid="ad-interests"
    >
      <div className="space-y-2">
        <h2
          id="ad-interests-title"
          className="text-lg font-semibold text-white tracking-tight"
        >
          {t('adInterests.title')}
        </h2>
        <p className="text-sm text-white/65 leading-relaxed max-w-xl">
          {t('adInterests.description')}
        </p>
      </div>

      {data.allowed ? (
        <>
          <div aria-live="polite" className="text-sm">
            <p className="text-white/75" data-testid="ad-interests-count">
              {t('adInterests.count', { count: chosen.length, max })}
            </p>
            {full ? (
              <p className="mt-1 text-white/55" data-testid="ad-interests-full">
                {t('adInterests.full', { max })}
              </p>
            ) : null}
          </div>

          <fieldset className="flex flex-wrap gap-2" disabled={busy}>
            <legend className="sr-only">
              {t('adInterests.options_label')}
            </legend>
            {AD_INTEREST_TOPICS.map((topic) => {
              const on = chosen.includes(topic);
              return (
                <button
                  key={topic}
                  type="button"
                  aria-pressed={on}
                  disabled={!on && full}
                  onClick={() => toggle(topic)}
                  data-testid={`ad-interest-${topic}`}
                  className={`inline-flex items-center gap-2 min-h-11 px-4 rounded-full border text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60 disabled:opacity-40 disabled:cursor-not-allowed ${
                    on
                      ? 'bg-brand-primary/20 border-brand-primary/60 text-white'
                      : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'
                  }`}
                >
                  {on ? <Check size={16} aria-hidden /> : null}
                  {t(`adInterests.topics.${topic}`)}
                </button>
              );
            })}
          </fieldset>

          <div className={BUTTON_PAIR}>
            {clearAll}
            <Button
              type="button"
              onClick={() => choose.mutate(inListOrder(chosen))}
              disabled={!changed}
              isLoading={busy}
              data-testid="ad-interests-save"
            >
              {t('adInterests.save')}
            </Button>
          </div>
        </>
      ) : (
        // Not known to be 18: none can be chosen, and none is used. What was
        // stored before (a date of birth corrected since) can be cleared.
        <div
          className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/75 space-y-2"
          data-testid="ad-interests-not-allowed"
        >
          <p>
            {t(
              data.dateOfBirthMissing
                ? 'adInterests.no_birth_date'
                : 'adInterests.minor',
            )}
          </p>
          {data.dateOfBirthMissing ? (
            <Link
              to="/accounts/account"
              className="inline-flex items-center min-h-11 font-medium text-brand-primary-text underline underline-offset-4"
            >
              {t('adInterests.add_birth_date')}
            </Link>
          ) : null}
          {data.interests.length > 0 ? (
            <>
              <p>{t('adInterests.stored_unused')}</p>
              {clearAll}
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
