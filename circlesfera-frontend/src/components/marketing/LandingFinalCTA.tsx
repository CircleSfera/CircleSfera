import { useTranslation } from 'react-i18next';
import { MarketingCTA } from './MarketingCTA';

/**
 * Closing conversion band — glass panel, not a thin divider strip.
 */
export function LandingFinalCTA() {
  const { t } = useTranslation();

  return (
    <section className="relative w-full px-4 sm:px-5 py-8 sm:py-12">
      <div className="mx-auto max-w-3xl glass-panel rounded-xl px-5 sm:px-8 py-8 sm:py-10 text-center">
        <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white mb-3 leading-[1.12]">
          {t('landing.cta.title')}
        </h2>
        <p className="text-base text-white/60 mb-6 max-w-lg mx-auto leading-relaxed">
          {t('landing.cta.subtitle')}
        </p>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
          <MarketingCTA to="/accounts/emailsignup" variant="primary">
            {t('landing.cta.button')}
          </MarketingCTA>
          <MarketingCTA to="/explore" variant="secondary">
            {t('landing.hero.explore_demo')}
          </MarketingCTA>
        </div>
      </div>
    </section>
  );
}
