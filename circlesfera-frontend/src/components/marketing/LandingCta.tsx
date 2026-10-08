import { useTranslation } from 'react-i18next';
import { MarketingCTA } from './MarketingCTA';

/** The last thing on a public page: the motto and the way in. */
export function LandingCta() {
  const { t } = useTranslation();

  return (
    <section className="px-4 pb-16 pt-4 sm:px-6 sm:pb-24">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-surface-elevated px-6 py-12 text-center sm:py-16">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(var(--brand-primary-rgb),0.35),transparent_65%)] pointer-events-none" />
        <div className="relative">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-brand-primary">
            {t('landing.hero.title_part1')} {t('landing.hero.title_part2')}
          </p>
          <h2 className="text-3xl font-black leading-[1.08] tracking-tight text-white sm:text-5xl">
            {t('landing.cta.title')}
          </h2>
          <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-white/65 sm:text-lg">
            {t('landing.cta.subtitle')}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <MarketingCTA
              to="/accounts/signup"
              variant="primary"
              className="w-full px-8 sm:w-auto"
            >
              {t('landing.cta.button')}
            </MarketingCTA>
            <MarketingCTA
              to="/explore"
              variant="secondary"
              size="lg"
              className="w-full px-8 sm:w-auto"
            >
              {t('landing.hero.explore_demo')}
            </MarketingCTA>
          </div>
        </div>
      </div>
    </section>
  );
}
