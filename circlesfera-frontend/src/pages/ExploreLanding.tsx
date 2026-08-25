import type { LucideIcon } from 'lucide-react';
import { Hash, Search, Sparkles, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SEO from '../components/common/SEO';
import {
  BentoCard,
  GuestSurfaceMedia,
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

/**
 * Guest /explore — discovery hub (not the authenticated Explore app).
 */
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
          className="pt-8 sm:pt-10 pb-6 sm:pb-8"
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {BLOCKS.map(({ key, icon }) => (
            <BentoCard
              key={key}
              title={t(`explore.landing.blocks.${key}.title`)}
              description={t(`explore.landing.blocks.${key}.desc`)}
              icon={icon}
            />
          ))}
        </div>

        <div className="relative mx-auto flex justify-center mt-32 sm:mt-48 lg:mt-64 pb-16 sm:pb-20">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-75 h-75 bg-brand-primary/20 blur-[100px] rounded-full pointer-events-none" />
          <GuestSurfaceMedia
            surface="explore"
            className="relative z-10 w-full shadow-[0_-20px_80px_rgba(var(--brand-primary-rgb),0.15)] ring-4 ring-white/5"
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-10 text-center max-w-3xl mx-auto">
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
