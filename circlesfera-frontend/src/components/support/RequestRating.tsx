import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type SupportRequestDetail,
  supportApi,
} from '../../services/support.service';
import { apiErrorMessage } from '../../utils/apiErrorMessage';
import { MarketingCTA } from '../marketing';
import { Textarea } from '../ui/Textarea';

const MAX_COMMENT = 500;

/**
 * Whether the answer was good or bad, said by who asked. Offered while the
 * request is solved; once it is closed the rating is only shown. An open
 * request has no answer to rate yet.
 */
export function RequestRating({ request }: { request: SupportRequestDetail }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const given = request.rating ?? null;
  const [score, setScore] = useState<'GOOD' | 'BAD' | null>(
    given?.score ?? null,
  );
  const [comment, setComment] = useState(given?.comment ?? '');
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: (chosen: 'GOOD' | 'BAD') =>
      supportApi.rate(request.id, chosen, comment.trim() || undefined),
    onSuccess: (res) => {
      queryClient.setQueryData<SupportRequestDetail>(
        ['support', 'my-request', request.id],
        res.data,
      );
      setSaved(true);
    },
  });

  if (request.status === 'CLOSED') {
    return given ? (
      <p className="mt-6 text-base text-white/70">
        {t('supportPage.requests.rating.yours', {
          score: t(`supportPage.requests.rating.${given.score}`),
        })}
      </p>
    ) : null;
  }
  if (request.status !== 'RESOLVED') return null;

  const send = (event: FormEvent) => {
    event.preventDefault();
    if (score) mutation.mutate(score);
  };
  const choice = (value: 'GOOD' | 'BAD', Icon: typeof ThumbsUp) => (
    <button
      type="button"
      aria-pressed={score === value}
      onClick={() => {
        setScore(value);
        setSaved(false);
      }}
      className={`inline-flex min-h-12 items-center gap-2 rounded-full border px-5 text-base font-semibold transition-colors ${
        score === value
          ? 'border-brand-primary bg-brand-primary/20 text-white'
          : 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10'
      }`}
    >
      <Icon size={18} aria-hidden />
      {t(`supportPage.requests.rating.${value}`)}
    </button>
  );

  return (
    <form
      onSubmit={send}
      className="mt-6 space-y-3 rounded-2xl glass-panel p-4"
      aria-label={t('supportPage.requests.rating.question')}
    >
      <p className="text-base font-semibold text-white">
        {t('supportPage.requests.rating.question')}
      </p>
      <div className="flex flex-wrap gap-2">
        {choice('GOOD', ThumbsUp)}
        {choice('BAD', ThumbsDown)}
      </div>
      {score && (
        <>
          <Textarea
            id="rating-comment"
            label={t('supportPage.requests.rating.comment_label')}
            value={comment}
            onChange={(event) => {
              setComment(event.target.value);
              setSaved(false);
            }}
            rows={3}
            maxLength={MAX_COMMENT}
            disabled={mutation.isPending}
          />
          {mutation.isError && (
            <p role="alert" className="text-sm text-red-400">
              {apiErrorMessage(
                mutation.error,
                t,
                'supportPage.requests.rating.error',
              )}
            </p>
          )}
          {saved && !mutation.isPending ? (
            <p role="status" className="text-base text-white/70">
              {t('supportPage.requests.rating.thanks')}
            </p>
          ) : (
            <MarketingCTA
              type="submit"
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={mutation.isPending}
            >
              {t(
                given
                  ? 'supportPage.requests.rating.change'
                  : 'supportPage.requests.rating.send',
              )}
            </MarketingCTA>
          )}
        </>
      )}
    </form>
  );
}
