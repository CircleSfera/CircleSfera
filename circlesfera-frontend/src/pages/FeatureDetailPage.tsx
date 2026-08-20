import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';
import SEO from '../components/common/SEO';
import {
  chapterToSurface,
  GuestSurfaceMedia,
  MarketingCTA,
  MarketingPage,
  MarketingPageHeader,
} from '../components/marketing';
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

/**
 * Guest deep-dive under /features/:slug — preview + copy.
 * Authenticated users are sent to the real product surface.
 */
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
    <MarketingPage atmosphere>
      <SEO
        title={t(`explore.features.${slug}.seo_title`)}
        description={t(`explore.features.${slug}.seo_desc`)}
      />

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-5 pb-10 sm:pb-12">
        <Link
          to="/features"
          className="inline-flex items-center gap-2 min-h-11 text-sm font-semibold text-white/55 hover:text-white mt-5 sm:mt-6 mb-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 rounded-lg"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
          {t('explore.features.common.back')}
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] gap-6 lg:gap-10 items-start mb-8">
          <div>
            <MarketingPageHeader
              className="mb-5"
              eyebrow={t('landing.features.badge')}
              title={t(`explore.features.${slug}.title`)}
              description={t(`explore.features.${slug}.lead`)}
              actions={
                <MarketingCTA to="/accounts/emailsignup" variant="primary">
                  {t('landing.hero.get_started')}
                </MarketingCTA>
              }
            />
          </div>
          <div className="w-full max-w-sm mx-auto lg:max-w-none">
            <GuestSurfaceMedia surface={chapterToSurface(slug)} />
          </div>
        </div>

        <ol className="grid grid-cols-1 gap-3 sm:gap-4 mb-8 max-w-3xl">
          {POINT_KEYS.map((point, index) => (
            <li key={point} className="glass-panel rounded-xl p-4 sm:p-5">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-primary mb-2 tabular-nums">
                {String(index + 1).padStart(2, '0')}
              </p>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight mb-1.5">
                {t(`explore.features.${slug}.points.${point}.title`)}
              </h2>
              <p className="text-sm text-white/55 leading-relaxed max-w-2xl">
                {t(`explore.features.${slug}.points.${point}.body`)}
              </p>
            </li>
          ))}
        </ol>

        <p className="text-sm text-white/55 leading-relaxed mb-8 max-w-2xl">
          {t(`explore.features.${slug}.closing`)}
        </p>

        <section aria-labelledby="features-more-heading" className="max-w-3xl">
          <h2
            id="features-more-heading"
            className="text-base font-bold text-white mb-3"
          >
            {t('explore.features.common.more_title')}
          </h2>
          <ul className="grid grid-cols-1 gap-2">
            {others.map((key) => (
              <li key={key}>
                <Link
                  to={`/features/${key}`}
                  className="group glass-panel rounded-xl flex items-center justify-between gap-4 px-4 py-3.5 min-h-12 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 hover:border-brand-primary/30 transition-colors"
                >
                  <span className="text-sm font-semibold text-white/80 group-hover:text-white">
                    {t(`landing.chapters.items.${key}.title`)}
                  </span>
                  <ArrowRight
                    className="w-4 h-4 text-white/30 group-hover:text-brand-primary shrink-0 transition-colors"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </MarketingPage>
  );
}

/** Legacy /explore/:feature → /features/:slug */
export function ExploreFeatureRedirect() {
  const { feature } = useParams<{ feature: string }>();
  if (feature && isFeatureSlug(feature)) {
    return <Navigate to={`/features/${feature}`} replace />;
  }
  return <Navigate to="/explore" replace />;
}
