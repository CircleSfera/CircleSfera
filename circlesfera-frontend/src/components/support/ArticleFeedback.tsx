import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { helpCentreApi } from '../../services/helpCentre.service';

const keyOf = (slug: string) => `help-article-answered:${slug}`;

// The browser remembers that it answered: a convenience, not a guarantee.
function answeredBefore(slug: string): boolean {
  try {
    return localStorage.getItem(keyOf(slug)) !== null;
  } catch {
    return false;
  }
}

function remember(slug: string, useful: boolean) {
  try {
    localStorage.setItem(keyOf(slug), useful ? 'yes' : 'no');
  } catch {
    // Private windows may refuse: the question is simply asked again.
  }
}

/**
 * "Was this useful?" at the end of an article of the help centre. Anyone
 * answers, once per browser; after answering it shows the thanks.
 */
export function ArticleFeedback({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<'asking' | 'sending' | 'done' | 'failed'>(
    () => (answeredBefore(slug) ? 'done' : 'asking'),
  );
  const [useful, setUseful] = useState<boolean | null>(null);

  const answer = async (value: boolean) => {
    setState('sending');
    try {
      await helpCentreApi.feedback(slug, value);
      remember(slug, value);
      setUseful(value);
      setState('done');
    } catch {
      setState('failed');
    }
  };

  if (state === 'done') {
    return (
      <p className="mt-10 text-base text-white/70" role="status">
        {t('helpCentre.feedback.thanks')}
        {useful === false && (
          <>
            {' '}
            <Link
              to="/support"
              className="font-semibold text-brand-primary underline underline-offset-2"
            >
              {t('helpCentre.contact_cta')}
            </Link>
          </>
        )}
      </p>
    );
  }

  return (
    <section
      aria-labelledby="article-feedback"
      className="mt-10 flex flex-wrap items-center gap-3"
    >
      <h2
        id="article-feedback"
        className="w-full text-base font-semibold text-white sm:mr-1 sm:w-auto"
      >
        {t('helpCentre.feedback.question')}
      </h2>
      {(
        [
          [true, ThumbsUp, 'yes'],
          [false, ThumbsDown, 'no'],
        ] as const
      ).map(([value, Icon, key]) => (
        <button
          key={key}
          type="button"
          onClick={() => answer(value)}
          disabled={state === 'sending'}
          className="inline-flex min-h-11 min-w-20 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 disabled:opacity-50"
        >
          <Icon size={18} aria-hidden />
          {t(`helpCentre.feedback.${key}`)}
        </button>
      ))}
      {state === 'failed' && (
        <p className="w-full text-sm text-brand-secondary" role="alert">
          {t('helpCentre.feedback.error')}
        </p>
      )}
    </section>
  );
}
