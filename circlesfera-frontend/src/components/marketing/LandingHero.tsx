import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { GuestSurfaceMedia } from './GuestSurfaceMedia';
import { MarketingCTA } from './MarketingCTA';

export function LandingHero() {
  const { t } = useTranslation();

  return (
    <section className="relative w-full overflow-hidden text-white pt-16 sm:pt-24 md:pt-32 pb-20">
      {/* Immersive cinematic background */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150%] sm:w-[120%] h-200 bg-[radial-gradient(ellipse_at_top,rgba(var(--brand-primary-rgb),0.15),transparent_60%)] pointer-events-none" />
      <div className="absolute top-40 left-1/2 -translate-x-1/2 w-200 h-100 bg-brand-blue/10 blur-[120px] rounded-full pointer-events-none mix-blend-screen opacity-50" />

      <div className="relative z-10 flex flex-col items-center text-center px-4 sm:px-6 mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-8"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-xl shadow-[0_0_20px_rgba(255,255,255,0.05)]">
            <span className="w-2 h-2 rounded-full bg-brand-primary animate-pulse-slow" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/80">
              {t('landing.hero.badge')}
            </span>
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tighter leading-[1.05] mb-6"
        >
          <span className="text-white drop-shadow-2xl">
            {t('landing.hero.title_part1')}{' '}
          </span>
          <br className="hidden sm:block" />
          <span className="text-transparent bg-clip-text bg-linear-to-b from-white/70 to-white/20">
            {t('landing.hero.title_part2')}
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="text-base sm:text-lg text-white/50 leading-relaxed max-w-2xl mb-10 font-medium"
        >
          {t('landing.hero.subtitle')}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto"
        >
          <MarketingCTA
            to="/accounts/signup"
            variant="primary"
            className="h-12 px-8 text-[15px] font-black w-full sm:w-auto rounded-xl! shadow-[0_0_40px_rgba(var(--brand-primary-rgb),0.3)] hover:shadow-[0_0_60px_rgba(var(--brand-primary-rgb),0.5)] transition-all hover:-translate-y-1"
          >
            {t('landing.hero.get_started')}
          </MarketingCTA>
          <MarketingCTA
            to="/explore"
            variant="secondary"
            className="h-12 px-8 text-[15px] font-bold w-full sm:w-auto rounded-xl! border-white/10 bg-white/5 hover:bg-white/10 backdrop-blur-xl transition-all"
          >
            {t('landing.hero.explore_demo')}
          </MarketingCTA>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="mt-8 text-sm text-white/40 font-medium"
        >
          {t('landing.hero.already')}{' '}
          <Link
            to="/accounts/login"
            className="text-white hover:text-brand-primary underline-offset-4 hover:underline transition-colors font-bold"
          >
            {t('landing.hero.log_in')}
          </Link>
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative mx-auto flex justify-center px-4 sm:px-6 mt-32 sm:mt-48 lg:mt-64 pb-20"
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-75 h-75 bg-brand-primary/20 blur-[100px] rounded-full pointer-events-none" />
        <GuestSurfaceMedia
          surface="home"
          className="relative z-10 w-full shadow-[0_-20px_80px_rgba(var(--brand-primary-rgb),0.15)] ring-4 ring-white/5"
        />
      </motion.div>
    </section>
  );
}
