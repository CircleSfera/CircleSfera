import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';
import SEO from '../components/common/SEO';
import {
  FeatureVisual,
  LandingCta,
  MarketingCTA,
  MarketingPage,
  MarketingPageHeader,
} from '../components/marketing';
import { BRAND_SMALL_TEXT, EYEBROW } from '../components/marketing/eyebrow';
import { useAuthStore } from '../stores/authStore';

export const FEATURE_SLUGS = [
  'feed',
  'frames',
  'direct',
  'live',
  'creator',
] as const;

export type FeatureSlug = (typeof FEATURE_SLUGS)[number];

const POINT_KEYS = ['p1', 'p2', 'p3'] as const;

const AUTH_REDIRECT: Record<FeatureSlug, string> = {
  feed: '/',
  frames: '/frames',
  direct: '/direct/inbox',
  live: '/live',
  creator: '/pricing',
};

export function isFeatureSlug(value: string): value is FeatureSlug {
  return (FEATURE_SLUGS as readonly string[]).includes(value);
}

// Guest deep-dive under /features/:slug — copy, then product mock.
// Authenticated users are sent to the real product surface.
export default function FeatureDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!slug || !isFeatureSlug(slug)) {
    return <Navigate to="/features" replace />;
  }

  if (isAuthenticated) {
    return <Navigate to={AUTH_REDIRECT[slug]} replace />;
  }

  const others = FEATURE_SLUGS.filter((key) => key !== slug);

  return (
    <MarketingPage>
      <SEO
        title={t(`explore.features.${slug}.seo_title`)}
        description={t(`explore.features.${slug}.seo_desc`)}
      />

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 pb-14 sm:pb-20">
        <Link
          to="/features"
          className="inline-flex items-center gap-2 min-h-11 text-sm font-semibold text-white/55 hover:text-white mt-5 sm:mt-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 rounded-full"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
          {t('explore.features.common.back')}
        </Link>

        <div className="grid items-center gap-10 pt-6 sm:pt-10 md:grid-cols-2 md:gap-16">
          <MarketingPageHeader
            className="text-center md:text-left"
            eyebrow={t(`explore.features.${slug}.title`)}
            title={t(`landing.chapters.items.${slug}.headline`)}
            description={t(`landing.chapters.items.${slug}.desc`)}
            actions={
              <MarketingCTA
                to="/accounts/signup"
                variant="primary"
                className="px-8"
              >
                {t('landing.hero.get_started')}
              </MarketingCTA>
            }
          />
          <FeatureVisual feature={slug} />
        </div>

        <ol className="mt-14 grid grid-cols-1 gap-4 sm:mt-20 md:grid-cols-3">
          {POINT_KEYS.map((point, index) => (
            <li key={point} className="rounded-3xl glass-panel p-6">
              <p
                className={`mb-3 text-xs font-bold tabular-nums ${BRAND_SMALL_TEXT}`}
              >
                {String(index + 1).padStart(2, '0')}
              </p>
              <h2 className="mb-2 text-lg font-bold tracking-tight text-white sm:text-xl">
                {t(`explore.features.${slug}.points.${point}.title`)}
              </h2>
              <p className="text-sm leading-relaxed text-white/60 sm:text-base">
                {t(`explore.features.${slug}.points.${point}.body`)}
              </p>
            </li>
          ))}
        </ol>

        <section
          aria-labelledby="features-more-heading"
          className="mt-14 sm:mt-20"
        >
          <h2
            id="features-more-heading"
            className="mb-4 text-2xl font-black tracking-tight text-white sm:text-3xl"
          >
            {t('explore.features.common.more_title')}
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {others.map((key) => (
              <li key={key}>
                <Link
                  to={`/features/${key}`}
                  className="group flex min-h-16 items-center justify-between gap-4 rounded-3xl glass-panel px-6 py-4 transition-colors hover:border-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
                >
                  <span>
                    <span className={`block ${EYEBROW}`}>
                      {t(`landing.chapters.items.${key}.title`)}
                    </span>
                    <span className="mt-1 block text-base font-semibold text-white/85 group-hover:text-white">
                      {t(`landing.chapters.items.${key}.headline`)}
                    </span>
                  </span>
                  <ArrowRight
                    className="h-5 w-5 shrink-0 text-white/30 transition-colors group-hover:text-brand-primary"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <LandingCta />
    </MarketingPage>
  );
}

// Legacy /explore/:feature → /features/:slug
export function ExploreFeatureRedirect() {
  const { feature } = useParams<{ feature: string }>();
  if (feature && isFeatureSlug(feature)) {
    return <Navigate to={`/features/${feature}`} replace />;
  }
  return <Navigate to="/explore" replace />;
}
