import { ArrowRight, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { MarketingCTA } from './MarketingCTA';

export function LandingHero() {
  const { t } = useTranslation();

  return (
    <section className="relative w-full overflow-hidden text-white pt-24 sm:pt-36 pb-16 flex flex-col items-center justify-center">
      {/* Ultra minimalist centered hero */}
      <div className="mx-auto max-w-5xl px-6 sm:px-12 relative z-10 flex flex-col items-center text-center animate-slide-up">
        {/* Subtle pill badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 mb-8 backdrop-blur-md shadow-xl hover:bg-white/10 transition-colors cursor-default">
          <Sparkles className="w-3.5 h-3.5 text-brand-primary" />
          <p className="text-xs font-bold uppercase tracking-widest text-white/90">
            {t('landing.hero.badge', 'SOCIAL REIMAGINED')}
          </p>
        </div>

        {/* Massive Typography */}
        <h1 className="text-6xl sm:text-7xl md:text-8xl lg:text-[7rem] font-black tracking-tighter leading-[0.95] mb-8">
          <span className="text-white block">
            {t('landing.hero.title_part1', 'Share Your')}
          </span>
          <span className="text-transparent bg-clip-text bg-linear-to-b from-white via-white to-white/40">
            {t('landing.hero.title_part2', 'Universe.')}
          </span>
        </h1>

        <p className="text-lg sm:text-xl md:text-2xl text-white/50 leading-relaxed max-w-2xl mb-12 font-medium">
          {t(
            'landing.hero.subtitle',
            'Connect with friends, share your moments, and explore a world of creativity. Experience a social platform designed for distinct visual storytelling.',
          )}
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-12 w-full sm:w-auto">
          <MarketingCTA
            to="/accounts/emailsignup"
            variant="white"
            className="h-14 px-8 text-base w-full sm:w-auto rounded-2xl group"
          >
            <span className="flex items-center gap-2 text-black">
              {t('landing.hero.get_started', 'Get Started')}
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </span>
          </MarketingCTA>
          <MarketingCTA
            to="/explore"
            variant="secondary"
            className="h-14 px-8 text-base bg-white/5 border-white/10 hover:bg-white/10 text-white w-full sm:w-auto rounded-2xl"
          >
            {t('landing.hero.explore_demo', 'Explore Demo')}
          </MarketingCTA>
        </div>

        {/* Login Link */}
        <p className="text-sm text-white/40 font-medium">
          {t('landing.hero.already', 'Already have an account?')}{' '}
          <Link
            to="/accounts/login"
            className="text-white hover:text-brand-primary transition-colors underline-offset-4 hover:underline focus:outline-none rounded"
          >
            {t('landing.hero.log_in', 'Log in')}
          </Link>
        </p>
      </div>

      {/* Decorative ultra-subtle grid background (Vercel style) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '4rem 4rem',
          maskImage:
            'radial-gradient(ellipse 60% 50% at 50% 0%, #000 70%, transparent 100%)',
        }}
      />
    </section>
  );
}
