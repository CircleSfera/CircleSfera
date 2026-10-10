import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { LandingPhone } from './LandingPhone';
import { MarketingCTA } from './MarketingCTA';

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The top of the public landing: what CircleSfera is, the way in, and the
 * app itself beside it. One column on a phone, two from desktop width, so
 * the product shows without scrolling.
 */
export function LandingHero() {
  const { t } = useTranslation();

  return (
    <section className="relative w-full overflow-hidden text-white pt-12 sm:pt-16 lg:pt-24 pb-16 lg:pb-24">
      {/* One wash of the brand colours behind the whole section */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(var(--brand-primary-rgb),0.22),transparent_55%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_90%_30%,rgba(64,93,230,0.16),transparent_50%)] pointer-events-none" />

      <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05, ease: EASE }}
            className="text-5xl font-black leading-[1.02] tracking-tighter sm:text-6xl lg:text-7xl"
          >
            <span className="block text-white">
              {t('landing.hero.title_part1')}
            </span>{' '}
            <span className="block bg-linear-to-r from-brand-secondary via-brand-primary to-brand-blue bg-clip-text text-transparent">
              {t('landing.hero.title_part2')}
            </span>
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12, ease: EASE }}
            className="mt-6 max-w-xl"
          >
            {/* The motto stays in English in every language; this line says
                what it means in the reader's own. */}
            <p className="text-xl font-bold text-white sm:text-2xl">
              {t('landing.hero.lead')}
            </p>
            <p className="mt-3 text-base leading-relaxed text-white/65 sm:text-lg">
              {t('landing.hero.subtitle')}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18, ease: EASE }}
            className="mt-8 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row"
          >
            <MarketingCTA
              to="/accounts/signup"
              variant="primary"
              className="w-full px-8 sm:w-auto"
            >
              {t('landing.hero.get_started')}
            </MarketingCTA>
            <MarketingCTA
              to="/explore"
              variant="secondary"
              size="lg"
              className="w-full px-8 sm:w-auto"
            >
              {t('landing.hero.explore_demo')}
            </MarketingCTA>
          </motion.div>

          <p className="mt-8 text-sm text-white/50">
            {t('landing.hero.already')}{' '}
            <Link
              to="/accounts/login"
              className="inline-flex min-h-11 min-w-11 items-center justify-center -my-3 font-bold text-white underline-offset-4 transition-colors hover:text-brand-primary hover:underline"
            >
              {t('landing.hero.log_in')}
            </Link>
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: EASE }}
        >
          <LandingPhone />
        </motion.div>
      </div>
    </section>
  );
}
