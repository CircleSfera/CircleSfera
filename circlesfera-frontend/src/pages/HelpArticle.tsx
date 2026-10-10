import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import SEO from '../components/common/SEO';
import { MarketingCTA, MarketingPage } from '../components/marketing';
import { ArticleBody } from '../components/support/ArticleBody';
import { ArticleFeedback } from '../components/support/ArticleFeedback';
import { helpCentreApi } from '../services/helpCentre.service';
import { helpTopicLabel } from '../utils/helpTopic';

// Guest /help/:slug — one article of the help centre.
export default function HelpArticle() {
  const { t, i18n } = useTranslation();
  const { slug = '' } = useParams();

  const {
    data: article,
    isPending,
    error,
  } = useQuery({
    queryKey: ['help', 'article', slug, i18n.language],
    queryFn: () =>
      helpCentreApi.article(slug, i18n.language).then((res) => res.data),
    retry: false,
  });
  // A draft and an address that is nothing answer the same.
  const missing = (error as { status?: number } | null)?.status === 404;

  return (
    <MarketingPage>
      <SEO
        title={
          article
            ? t('helpCentre.article_seo_title', { title: article.title })
            : t('helpCentre.seo_title')
        }
        description={t('helpCentre.seo_desc')}
      />

      <article className="mx-auto w-full max-w-2xl px-4 pt-8 pb-10 sm:px-5 sm:pt-12 sm:pb-12">
        <Link
          to="/help"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-white/70 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
        >
          <ArrowLeft size={18} aria-hidden />
          {t('helpCentre.back')}
        </Link>

        {isPending ? (
          <p className="mt-6 text-base text-white/60">{t('common.loading')}</p>
        ) : article ? (
          <>
            <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-brand-primary">
              {helpTopicLabel(t, article.topic)}
            </p>
            <h1 className="mt-2 mb-6 text-3xl font-black leading-[1.08] tracking-tight text-white sm:text-4xl">
              {article.title}
            </h1>
            <ArticleBody body={article.body} />
            <ArticleFeedback key={article.slug} slug={article.slug} />
          </>
        ) : (
          <div className="mt-6" role="alert">
            <h1 className="text-2xl font-black tracking-tight text-white">
              {t(
                missing ? 'helpCentre.missing_title' : 'helpCentre.load_error',
              )}
            </h1>
            {missing && (
              <p className="mt-2 text-base text-white/60">
                {t('helpCentre.missing_desc')}
              </p>
            )}
          </div>
        )}

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
      </article>
    </MarketingPage>
  );
}
