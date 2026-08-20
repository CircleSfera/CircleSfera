import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { GuestSurfaceMedia } from './GuestSurfaceMedia';
import { MarketingCTA } from './MarketingCTA';

export function LandingHero() {
  const { t } = useTranslation();

  return (
    <section className="relative w-full overflow-hidden text-white pt-8 sm:pt-12 pb-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-5">
            {t('landing.hero.badge')}
          </p>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight leading-[1.05] mb-5">
            <span className="text-white">{t('landing.hero.title_part1')} </span>
            <span className="text-white/70">
              {t('landing.hero.title_part2')}
            </span>
          </h1>
          <p className="text-base sm:text-lg text-white/55 leading-relaxed max-w-xl mb-8">
            {t('landing.hero.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <MarketingCTA
              to="/accounts/emailsignup"
              variant="white"
              className="h-11 px-5 text-sm w-full sm:w-auto"
            >
              {t('landing.hero.get_started')}
            </MarketingCTA>
            <MarketingCTA
              to="/explore"
              variant="secondary"
              className="h-11 px-5 text-sm w-full sm:w-auto"
            >
              {t('landing.hero.explore_demo')}
            </MarketingCTA>
          </div>
          <p className="mt-4 text-sm text-white/40">
            {t('landing.hero.already')}{' '}
            <Link
              to="/accounts/login"
              className="text-white hover:text-brand-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 rounded"
            >
              {t('landing.hero.log_in')}
            </Link>
          </p>
        </div>
        <GuestSurfaceMedia surface="home" />
      </div>
    </section>
  );
}
