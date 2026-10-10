import type { LucideIcon } from 'lucide-react';
import { Hash, Search, Sparkles, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SEO from '../components/common/SEO';
import {
  ExploreVisual,
  MarketingCTA,
  MarketingPage,
  MarketingPageHeader,
} from '../components/marketing';

const BLOCKS: {
  key: 'search' | 'people' | 'tags' | 'feeds';
  icon: LucideIcon;
}[] = [
  { key: 'search', icon: Search },
  { key: 'people', icon: Users },
  { key: 'tags', icon: Hash },
  { key: 'feeds', icon: Sparkles },
];

// Guest /explore — discovery hub (not the authenticated Explore app).
export default function ExploreLanding() {
  const { t } = useTranslation();

  return (
    <MarketingPage>
      <SEO
        title={t('explore.landing.title')}
        description={t('explore.landing.desc')}
      />

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-5 pb-10 sm:pb-12">
        <MarketingPageHeader
          className="pt-12 sm:pt-20 pb-10 sm:pb-14"
          align="center"
          eyebrow={t('explore.landing.the_platform')}
          title={
            <>
              {t('explore.landing.discover_new')}{' '}
              <span className="text-transparent bg-clip-text bg-linear-to-r from-brand-secondary via-brand-primary to-brand-blue">
                {t('explore.landing.dimension')}
              </span>
            </>
          }
          description={t('explore.landing.intro_text')}
          actions={
            <MarketingCTA to="/accounts/signup" variant="primary">
              {t('explore.landing.create_account')}
            </MarketingCTA>
          }
        />

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BLOCKS.map(({ key, icon: Icon }) => (
            <li key={key} className="rounded-3xl glass-panel p-6">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary/15 text-brand-primary">
                <Icon size={22} strokeWidth={1.75} aria-hidden />
              </span>
              <h2 className="mt-4 text-lg font-bold tracking-tight text-white">
                {t(`explore.landing.blocks.${key}.title`)}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-white/60">
                {t(`explore.landing.blocks.${key}.desc`)}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-14 pb-14 sm:mt-20 sm:pb-20">
          <ExploreVisual />
        </div>

        <div className="rounded-3xl glass-panel p-6 md:p-12 text-center max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-3">
            {t('explore.landing.join_title')}
          </h2>
          <p className="text-sm md:text-base text-white/50 max-w-md mx-auto mb-6">
            {t('explore.landing.join_desc')}
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            <MarketingCTA to="/accounts/signup" variant="primary">
              {t('explore.landing.create_account')}
            </MarketingCTA>
            <MarketingCTA to="/features" variant="secondary">
              {t('explore.landing.see_features')}
            </MarketingCTA>
          </div>
        </div>
      </div>
    </MarketingPage>
  );
}
