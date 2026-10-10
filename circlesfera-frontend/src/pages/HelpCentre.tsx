import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import SEO from '../components/common/SEO';
import {
  MarketingCTA,
  MarketingPage,
  MarketingPageHeader,
} from '../components/marketing';
import { ArticleLinks } from '../components/support/ArticleLinks';
import { Input } from '../components/ui/Input';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { type HelpTopic, helpCentreApi } from '../services/helpCentre.service';
import { helpTopicLabel } from '../utils/helpTopic';

const TOPICS: HelpTopic[] = ['ACCOUNT', 'PAYMENTS', 'CONTENT', 'OTHER'];
// A search of fewer characters finds nothing.
const MIN_SEARCH = 2;

// Guest /help — the help centre: the published articles by topic, and a
// search over them.
export default function HelpCentre() {
  const { t, i18n } = useTranslation();
  const [typed, setTyped] = useState('');
  const words = useDebouncedValue(typed.trim());
  const searching = words.length >= MIN_SEARCH;

  const { data, isError, isPending } = useQuery({
    queryKey: ['help', 'articles', i18n.language, searching ? words : ''],
    queryFn: () =>
      helpCentreApi
        .list(i18n.language, searching ? words : undefined)
        .then((res) => res.data),
  });
  const articles = data?.articles ?? [];

  return (
    <MarketingPage>
      <SEO
        title={t('helpCentre.seo_title')}
        description={t('helpCentre.seo_desc')}
      />

      <div className="mx-auto w-full max-w-2xl px-4 pb-10 sm:px-5 sm:pb-12">
        <MarketingPageHeader
          className="pt-12 pb-8 sm:pt-20 sm:pb-10"
          eyebrow={t('helpCentre.badge')}
          title={t('helpCentre.title')}
          description={t('helpCentre.subtitle')}
        />

        <search>
          <Input
            id="help-search"
            type="search"
            aria-label={t('helpCentre.search_label')}
            placeholder={t('helpCentre.search_placeholder')}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            icon={<Search size={18} aria-hidden />}
            maxLength={100}
          />
        </search>

        <div className="mt-8" aria-live="polite">
          {isError ? (
            <p className="text-base text-white/60" role="alert">
              {t('helpCentre.load_error')}
            </p>
          ) : isPending ? (
            <p className="text-base text-white/60">{t('common.loading')}</p>
          ) : searching ? (
            articles.length > 0 ? (
              <section aria-labelledby="help-results">
                <h2
                  id="help-results"
                  className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50"
                >
                  {t('helpCentre.results', { count: articles.length })}
                </h2>
                <ArticleLinks articles={articles} />
              </section>
            ) : (
              <p className="text-base text-white/60">
                {t('helpCentre.no_results', { words })}
              </p>
            )
          ) : articles.length === 0 ? (
            <p className="text-base text-white/60">{t('helpCentre.empty')}</p>
          ) : (
            <div className="space-y-8">
              {TOPICS.map((topic) => {
                const ofTopic = articles.filter((one) => one.topic === topic);
                if (ofTopic.length === 0) return null;
                return (
                  <section key={topic} aria-labelledby={`help-${topic}`}>
                    <h2
                      id={`help-${topic}`}
                      className="mb-3 text-xl font-black tracking-tight text-white"
                    >
                      {helpTopicLabel(t, topic)}
                    </h2>
                    <ArticleLinks articles={ofTopic} />
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <section className="mt-10 rounded-3xl glass-panel p-6 text-center sm:mt-14">
          <h2 className="text-xl font-black tracking-tight text-white">
            {t('helpCentre.contact_title')}
          </h2>
          <p className="mt-2 text-base leading-relaxed text-white/60">
            {t('helpCentre.contact_desc')}
          </p>
          <div className="mt-5 flex justify-center">
            <MarketingCTA to="/support" variant="secondary" size="lg">
              {t('helpCentre.contact_cta')}
            </MarketingCTA>
          </div>
        </section>
      </div>
    </MarketingPage>
  );
}
