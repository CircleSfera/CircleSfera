import { useTranslation } from 'react-i18next';
import SEO from '../components/common/SEO';
import {
  FEATURE_KEYS,
  FeatureShowcase,
  LandingCta,
  MarketingPage,
  MarketingPageHeader,
} from '../components/marketing';

// Guest /features — product surfaces with previews.
export default function FeaturesPage() {
  const { t } = useTranslation();

  return (
    <MarketingPage>
      <SEO
        title={t('landing.pages.features.seo_title')}
        description={t('landing.pages.features.seo_desc')}
      />

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-5 pb-10 sm:pb-12">
        <MarketingPageHeader
          className="pt-12 sm:pt-20 pb-8 sm:pb-12"
          align="center"
          eyebrow={t('landing.features.badge')}
          title={t('landing.features.title')}
          description={t('landing.features.subtitle')}
        />
        {/* Straight to one feature: the page is long. */}
        <nav
          aria-label={t('landing.features.badge')}
          className="flex flex-wrap justify-center gap-2"
        >
          {FEATURE_KEYS.map((key) => (
            <a
              key={key}
              href={`#feature-${key}`}
              className="inline-flex h-11 items-center rounded-full border border-white/10 bg-white/8 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/12 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"
            >
              {t(`landing.chapters.items.${key}.title`)}
            </a>
          ))}
        </nav>
        <div className="mt-14 sm:mt-20">
          <FeatureShowcase />
        </div>
      </div>
      <LandingCta />
    </MarketingPage>
  );
}
