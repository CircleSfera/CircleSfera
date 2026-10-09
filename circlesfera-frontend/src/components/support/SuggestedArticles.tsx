import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { helpCentreApi } from '../../services/helpCentre.service';

// From how many characters of the subject on, and how many articles.
const MIN_SUBJECT = 4;
const MAX_SUGGESTED = 3;

/**
 * Articles of the help centre that match the subject being typed in the
 * support form. They open in another tab, so what was typed is not lost.
 * Shows nothing when nothing matches.
 */
export function SuggestedArticles({ subject }: { subject: string }) {
  const { t, i18n } = useTranslation();
  const words = useDebouncedValue(subject.trim());
  const asks = words.length >= MIN_SUBJECT;

  const { data } = useQuery({
    queryKey: ['help', 'articles', i18n.language, words],
    queryFn: () =>
      helpCentreApi.list(i18n.language, words).then((res) => res.data),
    enabled: asks,
    retry: false,
  });
  const articles = asks ? (data?.articles ?? []).slice(0, MAX_SUGGESTED) : [];
  if (articles.length === 0) return null;

  return (
    <section
      aria-labelledby="suggested-articles"
      className="rounded-2xl border border-white/10 bg-white/4 p-4"
    >
      <h3
        id="suggested-articles"
        className="text-sm font-semibold text-white/85"
      >
        {t('helpCentre.suggested_title')}
      </h3>
      <ul className="mt-2">
        {articles.map((article) => (
          <li key={article.slug}>
            <a
              href={`/help/${article.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-primary underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
            >
              <span className="min-w-0 flex-1">{article.title}</span>
              <ExternalLink size={16} className="shrink-0" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
